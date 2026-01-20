import { connectToDb, getSql } from '@/lib/database'
import { getGamesNeedingAnalysis } from '@/lib/engineStorage'

export interface EngineAnalysisJob {
  id: string
  gameId: string
  engineName: string
  analysisDepth: number
}

let queueReady = false

async function ensureQueueTable(): Promise<void> {
  if (queueReady) return
  await connectToDb()
  const sql = getSql()
  await sql`
    CREATE TABLE IF NOT EXISTS engine_analysis_queue (
      id BIGSERIAL PRIMARY KEY,
      game_id UUID NOT NULL,
      engine_name TEXT NOT NULL,
      analysis_depth INT NOT NULL DEFAULT 15,
      status TEXT NOT NULL DEFAULT 'pending',
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (game_id, engine_name, analysis_depth)
    )
  `
  queueReady = true
}

export async function requeueStaleProcessingJobs(opts: {
  engineName: string
  analysisDepth: number
  staleMinutes?: number
}): Promise<{ requeued: number }> {
  await ensureQueueTable()
  const sql = getSql()
  const staleMinutes = Math.max(1, Math.min(120, Math.trunc(opts.staleMinutes ?? 15)))

  // If a worker crashes / times out, jobs can get stuck in "processing" forever.
  // Requeue anything older than the stale threshold so progress can resume.
  const raw = await sql`
    UPDATE engine_analysis_queue
    SET
      status = 'pending',
      updated_at = now(),
      last_error = COALESCE(last_error, '') || ${`\n[auto] requeued stale processing job (> ${staleMinutes}m)`}
    WHERE status = 'processing'
      AND engine_name = ${opts.engineName}
      AND analysis_depth = ${opts.analysisDepth}
      AND updated_at < now() - (${staleMinutes} * INTERVAL '1 minute')
    RETURNING id
  `
  const rows = Array.isArray(raw) ? raw : []
  return { requeued: rows.length }
}

export async function getEngineQueueStats(engineName: string, analysisDepth: number): Promise<{
  total: number
  pending: number
  processing: number
  done: number
  failed: number
  staleProcessing: number
}> {
  await ensureQueueTable()
  const sql = getSql()

  const raw = (await sql`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
      COUNT(*) FILTER (WHERE status = 'processing')::int AS processing,
      COUNT(*) FILTER (WHERE status = 'done')::int AS done,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failed,
      COUNT(*) FILTER (WHERE status = 'processing' AND updated_at < now() - (15 * INTERVAL '1 minute'))::int AS stale_processing
    FROM engine_analysis_queue
    WHERE engine_name = ${engineName}
      AND analysis_depth = ${analysisDepth}
  `) as Array<{
    total: number
    pending: number
    processing: number
    done: number
    failed: number
    stale_processing: number
  }>

  const row = raw[0] ?? {
    total: 0,
    pending: 0,
    processing: 0,
    done: 0,
    failed: 0,
    stale_processing: 0,
  }
  return {
    total: Number(row.total) || 0,
    pending: Number(row.pending) || 0,
    processing: Number(row.processing) || 0,
    done: Number(row.done) || 0,
    failed: Number(row.failed) || 0,
    staleProcessing: Number(row.stale_processing) || 0,
  }
}

export async function enqueueEngineAnalysisJobs(
  limit: number,
  engineName: string,
  analysisDepth: number
): Promise<{ enqueued: number; skipped: number }> {
  await ensureQueueTable()
  const sql = getSql()
  const games = await getGamesNeedingAnalysis(limit, engineName, analysisDepth)
  let enqueued = 0
  let skipped = 0

  for (const game of games) {
    const raw = await sql`
      INSERT INTO engine_analysis_queue (
        game_id,
        engine_name,
        analysis_depth,
        status
      ) VALUES (
        ${game.id}::uuid,
        ${engineName},
        ${analysisDepth},
        'pending'
      )
      ON CONFLICT (game_id, engine_name, analysis_depth) DO NOTHING
      RETURNING id
    `
    const result = Array.isArray(raw) ? raw : []
    if (result.length > 0) {
      enqueued += 1
    } else {
      skipped += 1
    }
  }

  return { enqueued, skipped }
}

export async function claimEngineAnalysisJobs(
  limit: number,
  engineName: string,
  analysisDepth: number
): Promise<EngineAnalysisJob[]> {
  await ensureQueueTable()
  const sql = getSql()

  // Keep the queue flowing even if a previous worker died mid-batch.
  await requeueStaleProcessingJobs({ engineName, analysisDepth }).catch(() => null)

  const raw = await sql`
    WITH next_jobs AS (
      SELECT id
      FROM engine_analysis_queue
      WHERE status = 'pending'
        AND engine_name = ${engineName}
        AND analysis_depth = ${analysisDepth}
      ORDER BY created_at ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE engine_analysis_queue q
    SET
      status = 'processing',
      attempts = q.attempts + 1,
      updated_at = now()
    FROM next_jobs
    WHERE q.id = next_jobs.id
    RETURNING q.id, q.game_id, q.engine_name, q.analysis_depth
  `

  const rows = Array.isArray(raw) ? raw : []
  return rows.map((row: any) => ({
    id: String(row.id),
    gameId: String(row.game_id),
    engineName: String(row.engine_name),
    analysisDepth: Number(row.analysis_depth),
  }))
}

export async function markEngineAnalysisJobDone(jobId: string): Promise<void> {
  await ensureQueueTable()
  const sql = getSql()
  await sql`
    UPDATE engine_analysis_queue
    SET status = 'done', updated_at = now(), last_error = null
    WHERE id = ${jobId}::bigint
  `
}

export async function markEngineAnalysisJobFailed(jobId: string, reason: string): Promise<void> {
  await ensureQueueTable()
  const sql = getSql()
  await sql`
    UPDATE engine_analysis_queue
    SET status = 'failed', updated_at = now(), last_error = ${reason}
    WHERE id = ${jobId}::bigint
  `
}

export async function fetchQueuedGamePgn(gameId: string): Promise<string | null> {
  await ensureQueueTable()
  const sql = getSql()
  const raw = await sql`
    SELECT pgn_text
    FROM games
    WHERE id = ${gameId}::uuid
    LIMIT 1
  `
  const rows = Array.isArray(raw) ? raw : []
  const row = rows[0]
  if (!row?.pgn_text) return null
  return String(row.pgn_text)
}
