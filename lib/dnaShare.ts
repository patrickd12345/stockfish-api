import crypto from 'crypto'
import { connectToDb, getSql, isDbConfigured } from '@/lib/database'
import { loadEngineSummary } from '@/lib/engineSummaryStorage'
import { loadProgressionSummary } from '@/lib/progressionStorage'
import { getPatternSummaries } from '@/lib/blunderDna'
import type { EngineSummary } from '@/types/EngineSummary'
import type { ProgressionSummary } from '@/types/ProgressionSummary'

export interface DnaShare {
  slug: string
  lichessUserId: string
  createdAt: string
  revokedAt: string | null
}

export interface DnaEvidenceDrill {
  lichessGameId: string
  ply: number
  fen: string
  sideToMove: 'white' | 'black'
  myMove: string
  bestMove: string
  pv: string
  evalBefore: number
  evalAfter: number
  patternTag: string
  difficulty: number
  createdAt: string
}

let tableReady = false

async function ensureDnaSharesTable(): Promise<void> {
  if (tableReady) return
  if (!isDbConfigured()) throw new Error('Database not configured')
  await connectToDb()
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS dna_shares (
      slug TEXT PRIMARY KEY,
      lichess_user_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      revoked_at TIMESTAMPTZ,
      last_viewed_at TIMESTAMPTZ
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_dna_shares_user ON dna_shares (lichess_user_id)`
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_dna_shares_active_user
    ON dna_shares (lichess_user_id)
    WHERE revoked_at IS NULL
  `
  tableReady = true
}

function newSlug(): string {
  // ~12 chars, url-safe.
  return crypto.randomBytes(9).toString('base64url')
}

export async function getActiveDnaShareForUser(lichessUserId: string): Promise<DnaShare | null> {
  await ensureDnaSharesTable()
  const sql = getSql()
  const rows = (await sql`
    SELECT slug, lichess_user_id, created_at, revoked_at
    FROM dna_shares
    WHERE lichess_user_id = ${lichessUserId} AND revoked_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1
  `) as Array<{ slug: string; lichess_user_id: string; created_at: Date; revoked_at: Date | null }>
  if (rows.length === 0) return null
  const row = rows[0]
  return {
    slug: row.slug,
    lichessUserId: row.lichess_user_id,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null
  }
}

export async function createOrRotateDnaShare(lichessUserId: string): Promise<DnaShare> {
  await ensureDnaSharesTable()
  const sql = getSql()

  // Revoke any prior active share for this user, then create a new one.
  await sql`
    UPDATE dna_shares
    SET revoked_at = now()
    WHERE lichess_user_id = ${lichessUserId} AND revoked_at IS NULL
  `

  for (let attempt = 0; attempt < 8; attempt++) {
    const slug = newSlug()
    try {
      const rows = (await sql`
        INSERT INTO dna_shares (slug, lichess_user_id)
        VALUES (${slug}, ${lichessUserId})
        RETURNING slug, lichess_user_id, created_at, revoked_at
      `) as Array<{ slug: string; lichess_user_id: string; created_at: Date; revoked_at: Date | null }>

      const row = rows[0]
      return {
        slug: row.slug,
        lichessUserId: row.lichess_user_id,
        createdAt: row.created_at.toISOString(),
        revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null
      }
    } catch (e: any) {
      // Likely slug collision; retry. For any other failure, surface.
      const code = typeof e?.code === 'string' ? e.code : null
      if (code === '23505') continue
      throw e
    }
  }

  throw new Error('Failed to allocate share slug')
}

export async function getDnaShareBySlug(slug: string): Promise<DnaShare | null> {
  await ensureDnaSharesTable()
  const sql = getSql()
  const rows = (await sql`
    SELECT slug, lichess_user_id, created_at, revoked_at
    FROM dna_shares
    WHERE slug = ${slug} AND revoked_at IS NULL
    LIMIT 1
  `) as Array<{ slug: string; lichess_user_id: string; created_at: Date; revoked_at: Date | null }>

  if (rows.length === 0) return null
  const row = rows[0]

  // Best-effort view marker (do not fail page render if it errors).
  sql`
    UPDATE dna_shares
    SET last_viewed_at = now()
    WHERE slug = ${slug}
  `.catch(() => null)

  return {
    slug: row.slug,
    lichessUserId: row.lichess_user_id,
    createdAt: row.created_at.toISOString(),
    revokedAt: row.revoked_at ? row.revoked_at.toISOString() : null
  }
}

export async function loadDnaSnapshot(lichessUserId: string): Promise<{
  progression: ProgressionSummary | null
  engine: EngineSummary | null
  patterns: Awaited<ReturnType<typeof getPatternSummaries>>
  evidence: Array<{ patternTag: string; label: string; drills: DnaEvidenceDrill[] }>
  timeControls: Array<{ timeControl: string; games: number }>
}> {
  await connectToDb()
  const sql = getSql()

  const [progression, engine, patterns] = await Promise.all([
    loadProgressionSummary().catch(() => null),
    loadEngineSummary().catch(() => null),
    getPatternSummaries(lichessUserId).catch(() => [] as Awaited<ReturnType<typeof getPatternSummaries>>)
  ])

  const timeControls = await (async () => {
    try {
      const rows = (await sql`
        SELECT COALESCE(time_control, 'unknown') AS time_control, COUNT(*)::int AS games
        FROM public.lichess_recent_games
        WHERE lichess_user_id = ${lichessUserId}
        GROUP BY 1
        ORDER BY games DESC, time_control ASC
        LIMIT 12
      `) as Array<{ time_control: string; games: number }>
      return rows.map((r) => ({ timeControl: String(r.time_control), games: Number(r.games) }))
    } catch {
      return [] as Array<{ timeControl: string; games: number }>
    }
  })()

  const drills = await (async () => {
    try {
      const rows = (await sql`
        SELECT lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv, eval_before, eval_after, pattern_tag, difficulty, created_at
        FROM public.blunder_dna_drills
        WHERE lichess_user_id = ${lichessUserId}
        ORDER BY created_at DESC
        LIMIT 80
      `) as Array<any>

      return rows.map(
        (r): DnaEvidenceDrill => ({
          lichessGameId: String(r.lichess_game_id),
          ply: Number(r.ply),
          fen: String(r.fen),
          sideToMove: r.side_to_move === 'black' ? 'black' : 'white',
          myMove: String(r.my_move),
          bestMove: String(r.best_move),
          pv: String(r.pv),
          evalBefore: Number(r.eval_before),
          evalAfter: Number(r.eval_after),
          patternTag: String(r.pattern_tag),
          difficulty: Number(r.difficulty) || 1,
          createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
        })
      )
    } catch {
      return [] as DnaEvidenceDrill[]
    }
  })()

  const evidenceByTag = new Map<string, DnaEvidenceDrill[]>()
  for (const d of drills) {
    const key = d.patternTag
    const list = evidenceByTag.get(key) ?? []
    if (list.length < 2) list.push(d)
    evidenceByTag.set(key, list)
  }

  const evidence = patterns
    .slice(0, 5)
    .map((p) => ({
      patternTag: p.patternTag,
      label: p.label,
      drills: evidenceByTag.get(p.patternTag) ?? []
    }))
    .filter((x) => x.drills.length > 0)

  return { progression, engine, patterns, evidence, timeControls }
}

export async function loadSharedLichessPgn(params: {
  slug: string
  lichessGameId: string
}): Promise<{ lichessUserId: string; pgn: string } | null> {
  const share = await getDnaShareBySlug(params.slug)
  if (!share) return null
  await connectToDb()
  const sql = getSql()
  try {
    const rows = (await sql`
      SELECT pgn
      FROM public.lichess_recent_games
      WHERE lichess_user_id = ${share.lichessUserId} AND lichess_game_id = ${params.lichessGameId}
      LIMIT 1
    `) as Array<{ pgn: string }>
    const pgn = rows[0]?.pgn
    if (!pgn) return null
    return { lichessUserId: share.lichessUserId, pgn: String(pgn) }
  } catch {
    return null
  }
}

export async function loadSharedDrillAtPly(params: {
  slug: string
  lichessGameId: string
  ply: number
}): Promise<DnaEvidenceDrill | null> {
  const share = await getDnaShareBySlug(params.slug)
  if (!share) return null
  await connectToDb()
  const sql = getSql()
  try {
    const rows = (await sql`
      SELECT lichess_game_id, ply, fen, side_to_move, my_move, best_move, pv, eval_before, eval_after, pattern_tag, difficulty, created_at
      FROM public.blunder_dna_drills
      WHERE lichess_user_id = ${share.lichessUserId}
        AND lichess_game_id = ${params.lichessGameId}
        AND ply = ${params.ply}
      ORDER BY difficulty DESC, created_at DESC
      LIMIT 1
    `) as Array<any>
    if (rows.length === 0) return null
    const r = rows[0]
    return {
      lichessGameId: String(r.lichess_game_id),
      ply: Number(r.ply),
      fen: String(r.fen),
      sideToMove: r.side_to_move === 'black' ? 'black' : 'white',
      myMove: String(r.my_move),
      bestMove: String(r.best_move),
      pv: String(r.pv),
      evalBefore: Number(r.eval_before),
      evalAfter: Number(r.eval_after),
      patternTag: String(r.pattern_tag),
      difficulty: Number(r.difficulty) || 1,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
    }
  } catch {
    return null
  }
}

