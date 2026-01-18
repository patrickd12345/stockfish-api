import { connectToDb, getSql } from '@/lib/database'
import { EngineSummary } from '@/types/EngineSummary'

/**
 * Store engine summary in database
 */
export async function storeEngineSummary(summary: EngineSummary): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  await sql`
    INSERT INTO engine_summaries (
      id,
      summary_data,
      game_count_used
    ) VALUES (
      ${summary.id},
      ${JSON.stringify(summary)}::jsonb,
      ${summary.gameCountUsed}
    )
    ON CONFLICT (id) DO UPDATE SET
      summary_data = EXCLUDED.summary_data,
      game_count_used = EXCLUDED.game_count_used,
      computed_at = now(),
      updated_at = now()
  `
}

/**
 * Load the most recent engine summary
 */
export async function loadEngineSummary(): Promise<EngineSummary | null> {
  await connectToDb()
  const sql = getSql()
  
  const result = (await sql`
    SELECT summary_data
    FROM engine_summaries
    ORDER BY computed_at DESC
    LIMIT 1
  `) as Array<{ summary_data: EngineSummary }>
  
  if (result.length === 0) {
    return null
  }
  
  return result[0].summary_data
}

/**
 * Get engine summary metadata
 */
export async function getEngineSummaryMetadata(): Promise<{
  exists: boolean
  computedAt: Date | null
  gameCountUsed: number
  currentAnalysisCount: number
} | null> {
  await connectToDb()
  const sql = getSql()
  
  try {
    // Get summary metadata
    const summaryResult = (await sql`
      SELECT computed_at, game_count_used
      FROM engine_summaries
      ORDER BY computed_at DESC
      LIMIT 1
    `) as Array<{ computed_at: Date; game_count_used: number }>
    
    // Get current analysis count
    const analysisCountResult = (await sql`
      SELECT COUNT(*) as count
      FROM engine_analysis
      WHERE analysis_failed = false
    `) as Array<{ count: number }>
    
    const currentAnalysisCount = Number(analysisCountResult[0]?.count || 0)
    
    if (summaryResult.length === 0) {
      return {
        exists: false,
        computedAt: null,
        gameCountUsed: 0,
        currentAnalysisCount
      }
    }
    
    return {
      exists: true,
      computedAt: summaryResult[0].computed_at as Date,
      gameCountUsed: Number(summaryResult[0].game_count_used || 0),
      currentAnalysisCount
    }
  } catch (error) {
    console.error('Failed to get engine summary metadata:', error)
    return null
  }
}
