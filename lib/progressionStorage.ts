import { connectToDb, getSql } from '@/lib/database'
import { ProgressionSummary, StoredProgressionSummary } from '@/types/ProgressionSummary'

type DbRow = Record<string, unknown>

/**
 * Store a progression summary in the database
 */
export async function storeProgressionSummary(summary: ProgressionSummary): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  await sql`
    INSERT INTO progression_summaries (id, summary_data, computed_at, game_count_used, updated_at)
    VALUES (
      'default',
      ${JSON.stringify(summary)},
      ${summary.computedAt},
      ${summary.gameCountUsed},
      now()
    )
    ON CONFLICT (id) 
    DO UPDATE SET
      summary_data = EXCLUDED.summary_data,
      computed_at = EXCLUDED.computed_at,
      game_count_used = EXCLUDED.game_count_used,
      updated_at = now()
  `
}

/**
 * Load the latest progression summary from the database
 */
export async function loadProgressionSummary(): Promise<ProgressionSummary | null> {
  try {
    await connectToDb()
    const sql = getSql()
    
    const rows = (await sql`
      SELECT summary_data, computed_at, game_count_used
      FROM progression_summaries
      WHERE id = 'default'
      ORDER BY computed_at DESC
      LIMIT 1
    `) as DbRow[]
    
    if (rows.length === 0) {
      return null
    }
    
    const row = rows[0]
    return row.summary_data as ProgressionSummary
  } catch (error) {
    console.error('Failed to load progression summary:', error)
    return null
  }
}

/**
 * Check if progression summary needs to be recomputed
 */
export async function needsRecomputation(): Promise<boolean> {
  try {
    await connectToDb()
    const sql = getSql()
    
    // Get current game count
    const gameCountRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM games
    `) as DbRow[]
    
    const currentGameCount = Number(gameCountRows[0]?.count ?? 0)
    
    // Get stored summary info
    const summaryRows = (await sql`
      SELECT game_count_used, computed_at
      FROM progression_summaries
      WHERE id = 'default'
      ORDER BY computed_at DESC
      LIMIT 1
    `) as DbRow[]
    
    if (summaryRows.length === 0) {
      // No summary exists, need to compute
      return currentGameCount > 0
    }
    
    const storedGameCount = Number(summaryRows[0]?.game_count_used ?? 0)
    
    // Need recomputation if game count changed
    return currentGameCount !== storedGameCount
  } catch (error) {
    console.error('Failed to check recomputation need:', error)
    return true // Default to recompute on error
  }
}

/**
 * Get summary metadata without loading full summary
 */
export async function getProgressionSummaryMetadata(): Promise<{
  exists: boolean
  gameCountUsed: number
  computedAt: string | null
  currentGameCount: number
} | null> {
  try {
    await connectToDb()
    const sql = getSql()
    
    // Get current game count
    const gameCountRows = (await sql`
      SELECT COUNT(*)::int AS count
      FROM games
    `) as DbRow[]
    
    const currentGameCount = Number(gameCountRows[0]?.count ?? 0)
    
    // Get stored summary info
    const summaryRows = (await sql`
      SELECT game_count_used, computed_at
      FROM progression_summaries
      WHERE id = 'default'
      ORDER BY computed_at DESC
      LIMIT 1
    `) as DbRow[]
    
    if (summaryRows.length === 0) {
      return {
        exists: false,
        gameCountUsed: 0,
        computedAt: null,
        currentGameCount
      }
    }
    
    const row = summaryRows[0]
    return {
      exists: true,
      gameCountUsed: Number(row.game_count_used ?? 0),
      computedAt: String(row.computed_at),
      currentGameCount
    }
  } catch (error) {
    console.error('Failed to get progression summary metadata:', error)
    return null
  }
}

/**
 * Delete all progression summaries (for testing/reset)
 */
export async function clearProgressionSummaries(): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  await sql`DELETE FROM progression_summaries`
}