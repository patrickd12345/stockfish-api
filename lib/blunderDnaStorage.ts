/**
 * Storage operations for Blunder DNA snapshots
 */

import { connectToDb, getSql, isDbConfigured } from '@/lib/database'
import type { BlunderDnaSnapshot, BlunderPattern } from './blunderDnaV1'

/**
 * Snapshot TTL: 24 hours in milliseconds
 */
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Check if a snapshot is still valid (within TTL)
 */
export function isSnapshotValid(snapshot: BlunderDnaSnapshot | null): boolean {
  if (!snapshot) return false
  
  const computedAt = new Date(snapshot.computedAt).getTime()
  const now = Date.now()
  const age = now - computedAt
  
  return age < SNAPSHOT_TTL_MS
}

/**
 * Normalize player name for exact matching
 */
export function normalizePlayerName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Ensure blunder_dna_snapshots table exists
 */
async function ensureSnapshotTable(): Promise<void> {
  if (!isDbConfigured()) return
  await connectToDb()
  const sql = getSql()
  
  await sql`
    CREATE TABLE IF NOT EXISTS blunder_dna_snapshots (
      user_id TEXT NOT NULL,
      snapshot_date DATE NOT NULL,
      games_analyzed INT NOT NULL,
      blunders_total INT NOT NULL,
      theme_phase_aggregates JSONB NOT NULL,
      computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, snapshot_date)
    )
  `
  
  await sql`
    CREATE INDEX IF NOT EXISTS idx_blunder_dna_snapshots_user_date 
    ON blunder_dna_snapshots (user_id, snapshot_date DESC)
  `
}

/**
 * Store a Blunder DNA snapshot
 */
export async function storeBlunderDnaSnapshot(snapshot: BlunderDnaSnapshot): Promise<void> {
  if (!isDbConfigured()) return
  await ensureSnapshotTable()
  await connectToDb()
  const sql = getSql()
  
  await sql`
    INSERT INTO blunder_dna_snapshots (
      user_id,
      snapshot_date,
      games_analyzed,
      blunders_total,
      theme_phase_aggregates,
      computed_at
    ) VALUES (
      ${snapshot.userId},
      ${snapshot.snapshotDate}::date,
      ${snapshot.gamesAnalyzed},
      ${snapshot.blundersTotal},
      ${JSON.stringify(snapshot.patterns)}::jsonb,
      ${new Date(snapshot.computedAt)}
    )
    ON CONFLICT (user_id, snapshot_date)
    DO UPDATE SET
      games_analyzed = EXCLUDED.games_analyzed,
      blunders_total = EXCLUDED.blunders_total,
      theme_phase_aggregates = EXCLUDED.theme_phase_aggregates,
      computed_at = EXCLUDED.computed_at
  `
}

/**
 * Get the latest Blunder DNA snapshot for a user
 */
export async function getLatestBlunderDnaSnapshot(userId: string): Promise<BlunderDnaSnapshot | null> {
  if (!isDbConfigured()) return null
  await ensureSnapshotTable()
  await connectToDb()
  const sql = getSql()
  
  const rows = (await sql`
    SELECT 
      user_id,
      snapshot_date,
      games_analyzed,
      blunders_total,
      theme_phase_aggregates,
      computed_at
    FROM blunder_dna_snapshots
    WHERE user_id = ${userId}
    ORDER BY snapshot_date DESC, computed_at DESC
    LIMIT 1
  `) as Array<any>
  
  if (rows.length === 0) return null
  
  const row = rows[0]
  return {
    userId: row.user_id,
    snapshotDate: row.snapshot_date instanceof Date 
      ? row.snapshot_date.toISOString().slice(0, 10)
      : String(row.snapshot_date),
    gamesAnalyzed: Number(row.games_analyzed),
    blundersTotal: Number(row.blunders_total),
    patterns: Array.isArray(row.theme_phase_aggregates) 
      ? row.theme_phase_aggregates as BlunderPattern[]
      : [],
    computedAt: row.computed_at instanceof Date
      ? row.computed_at.toISOString()
      : String(row.computed_at),
  }
}

/**
 * Get user's last 50 analyzed games with their blunders
 * Matches games by player name (white or black)
 */
export async function getUserAnalyzedGamesWithBlunders(
  userId: string,
  limit: number = 50
): Promise<Array<{
  gameId: string
  blunders: Array<{
    moveNumber: number
    ply: number
    centipawnLoss: number
    evalBefore: number
    evalAfter: number
    playedMove: string
    bestMove: string | null
  }>
}>> {
  if (!isDbConfigured()) return []
  await connectToDb()
  const sql = getSql()
  
  // Normalize username for exact matching
  const normalizedUser = normalizePlayerName(userId)
  
  // Query: Get last N games where user is white or black, with engine analysis and blunders
  // Use exact normalized comparison instead of LIKE
  const rows = (await sql`
    SELECT DISTINCT
      g.id as game_id,
      ab.move_number,
      ab.ply,
      ab.centipawn_loss,
      ab.eval_before,
      ab.eval_after,
      ab.played_move,
      ab.best_move,
      ea.analyzed_at
    FROM games g
    INNER JOIN engine_analysis ea ON ea.game_id = g.id
    LEFT JOIN analysis_blunders ab ON ab.game_id = g.id 
      AND ab.engine_name = ea.engine_name 
      AND ab.analysis_depth = ea.analysis_depth
    WHERE ea.analysis_failed = false
      AND ea.analyzed_at IS NOT NULL
      AND (
        LOWER(TRIM(g.white)) = ${normalizedUser}
        OR LOWER(TRIM(g.black)) = ${normalizedUser}
      )
    ORDER BY ea.analyzed_at DESC
    LIMIT ${limit * 20} -- Over-fetch to account for multiple blunders per game
  `) as Array<any>
  
  // Group by game_id, preserving order
  const gamesMap = new Map<string, Array<{
    moveNumber: number
    ply: number
    centipawnLoss: number
    evalBefore: number
    evalAfter: number
    playedMove: string
    bestMove: string | null
  }>>()
  
  const seenGameIds = new Set<string>()
  const gameOrder: string[] = []
  
  for (const row of rows) {
    const gameId = String(row.game_id)
    
    // Track unique games in order
    if (!seenGameIds.has(gameId)) {
      seenGameIds.add(gameId)
      gameOrder.push(gameId)
      if (gameOrder.length >= limit) break
    }
    
    // Only process blunders for games we're tracking
    if (!seenGameIds.has(gameId)) continue
    
    if (!row.move_number) continue // Skip if no blunder
    
    const blunders = gamesMap.get(gameId) || []
    blunders.push({
      moveNumber: Number(row.move_number),
      ply: Number(row.ply),
      centipawnLoss: Number(row.centipawn_loss),
      evalBefore: Number(row.eval_before),
      evalAfter: Number(row.eval_after),
      playedMove: String(row.played_move),
      bestMove: row.best_move ? String(row.best_move) : null,
    })
    gamesMap.set(gameId, blunders)
  }
  
  // Convert to array format, preserving order
  const result: Array<{
    gameId: string
    blunders: Array<{
      moveNumber: number
      ply: number
      centipawnLoss: number
      evalBefore: number
      evalAfter: number
      playedMove: string
      bestMove: string | null
    }>
  }> = []
  
  for (const gameId of gameOrder.slice(0, limit)) {
    result.push({
      gameId,
      blunders: gamesMap.get(gameId) || [],
    })
  }
  
  return result
}
