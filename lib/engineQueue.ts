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
