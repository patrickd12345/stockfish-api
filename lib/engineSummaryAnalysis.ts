import { connectToDb, getSql } from '@/lib/database'
import { EngineSummary } from '@/types/EngineSummary'
import { storeEngineSummary } from '@/lib/engineSummaryStorage'

type DbRow = Record<string, unknown>

interface EngineAnalysisRow {
  id: string
  game_id: string
  avg_centipawn_loss: number | null
  blunders: number
  mistakes: number
  inaccuracies: number
  eval_swing_max: number | null
  opening_cpl: number | null
  middlegame_cpl: number | null
  endgame_cpl: number | null
  game_length: number
  engine_name: string
  engine_version: string | null
  analysis_depth: number
  analyzed_at: Date
}

/**
 * Compute engine summary from all engine_analysis rows
 * This is a FACT GENERATION function - no narration, no interpretation
 */
export async function computeEngineSummary(): Promise<EngineSummary> {
  await connectToDb()
  const sql = getSql()
  
  const now = new Date()
  const summaryId = `engine-${now.getTime()}`
  
  // Get total games count
  const totalGamesResult = (await sql`
    SELECT COUNT(*) as count FROM games
  `) as Array<{ count: number }>
  const totalGames = Number(totalGamesResult[0]?.count || 0)
  
  // 1. Get Aggregates using SQL
  const aggregatesResult = (await sql`
    SELECT 
      COUNT(*) as games_with_analysis,

      -- Overall Metrics
      AVG(avg_centipawn_loss) as avg_centipawn_loss,
      SUM(blunders) as total_blunders,
      SUM(mistakes) as total_mistakes,
      SUM(inaccuracies) as total_inaccuracies,
      AVG(eval_swing_max) as avg_eval_swing_max,

      -- Phase Averages (AVG ignores NULLs)
      AVG(opening_cpl) as opening_avg_cpl,
      AVG(middlegame_cpl) as middlegame_avg_cpl,
      AVG(endgame_cpl) as endgame_avg_cpl,

      -- Phase Counts (COUNT(col) ignores NULLs)
      COUNT(opening_cpl) as opening_count,
      COUNT(middlegame_cpl) as middlegame_count,
      COUNT(endgame_cpl) as endgame_count,

      -- Phase Blunders (Sum blunders only where phase CPL exists)
      SUM(CASE WHEN opening_cpl IS NOT NULL THEN blunders ELSE 0 END) as opening_blunders,
      SUM(CASE WHEN middlegame_cpl IS NOT NULL THEN blunders ELSE 0 END) as middlegame_blunders,
      SUM(CASE WHEN endgame_cpl IS NOT NULL THEN blunders ELSE 0 END) as endgame_blunders

    FROM engine_analysis
    WHERE analysis_failed = false
  `) as DbRow[]
  
  const aggs = aggregatesResult[0]
  const gamesWithEngineAnalysis = Number(aggs.games_with_analysis || 0)
  
  if (gamesWithEngineAnalysis === 0) {
    return createEmptyEngineSummary(summaryId, totalGames)
  }
  
  // 2. Get Trend Data (Last 100 rows)
  // We need recent vs previous, max 50 each.
  const trendRows = (await sql`
    SELECT
      avg_centipawn_loss,
      blunders
    FROM engine_analysis
    WHERE analysis_failed = false
    ORDER BY analyzed_at DESC
    LIMIT 100
  `) as DbRow[]
  
  // Reverse to get ASC order (oldest to newest) for slice logic
  trendRows.reverse()
  
  // 3. Get Engine Info (First analyzed)
  const engineInfoResult = (await sql`
    SELECT engine_name, engine_version, analysis_depth
    FROM engine_analysis
    WHERE analysis_failed = false
    ORDER BY analyzed_at ASC
    LIMIT 1
  `) as DbRow[]

  // --- Construct Summary ---

  const coveragePercent = totalGames > 0 ? (gamesWithEngineAnalysis / totalGames) * 100 : 0
  
  // Overall
  const avgCentipawnLoss = aggs.avg_centipawn_loss ? Number(aggs.avg_centipawn_loss) : null
  const totalBlunders = Number(aggs.total_blunders || 0)
  const totalMistakes = Number(aggs.total_mistakes || 0)
  const totalInaccuracies = Number(aggs.total_inaccuracies || 0)
  const avgEvalSwingMax = aggs.avg_eval_swing_max ? Number(aggs.avg_eval_swing_max) : null
  
  const blunderRate = gamesWithEngineAnalysis > 0 ? totalBlunders / gamesWithEngineAnalysis : 0
  const mistakeRate = gamesWithEngineAnalysis > 0 ? totalMistakes / gamesWithEngineAnalysis : 0
  const inaccuracyRate = gamesWithEngineAnalysis > 0 ? totalInaccuracies / gamesWithEngineAnalysis : 0
  
  // By Phase
  const openingCount = Number(aggs.opening_count || 0)
  const openingAvgCpl = aggs.opening_avg_cpl ? Number(aggs.opening_avg_cpl) : null
  const openingBlundersTotal = Number(aggs.opening_blunders || 0)
  const openingBlunderRate = openingCount > 0 ? openingBlundersTotal / openingCount : 0
  
  const middlegameCount = Number(aggs.middlegame_count || 0)
  const middlegameAvgCpl = aggs.middlegame_avg_cpl ? Number(aggs.middlegame_avg_cpl) : null
  const middlegameBlundersTotal = Number(aggs.middlegame_blunders || 0)
  const middlegameBlunderRate = middlegameCount > 0 ? middlegameBlundersTotal / middlegameCount : 0
  
  const endgameCount = Number(aggs.endgame_count || 0)
  const endgameAvgCpl = aggs.endgame_avg_cpl ? Number(aggs.endgame_avg_cpl) : null
  const endgameBlundersTotal = Number(aggs.endgame_blunders || 0)
  const endgameBlunderRate = endgameCount > 0 ? endgameBlundersTotal / endgameCount : 0
  
  // Trends
  // Re-implement logic on the subset of rows
  const recentCount = Math.min(50, Math.floor(trendRows.length / 2))
  const recentAnalyses = trendRows.slice(-recentCount)
  const previousAnalyses = trendRows.slice(-recentCount * 2, -recentCount)
  
  const recentWithCpl = recentAnalyses.filter(a => a.avg_centipawn_loss !== null)
  const recentAvgCpl = recentWithCpl.length > 0
    ? recentWithCpl.reduce((sum, a) => sum + Number(a.avg_centipawn_loss || 0), 0) / recentWithCpl.length
    : null

  const recentBlunders = recentAnalyses.reduce((sum, a) => sum + Number(a.blunders || 0), 0)
  const recentBlunderRate = recentAnalyses.length > 0 ? recentBlunders / recentAnalyses.length : 0
  
  const previousWithCpl = previousAnalyses.filter(a => a.avg_centipawn_loss !== null)
  const previousAvgCpl = previousWithCpl.length > 0
    ? previousWithCpl.reduce((sum, a) => sum + Number(a.avg_centipawn_loss || 0), 0) / previousWithCpl.length
    : null

  const previousBlunders = previousAnalyses.reduce((sum, a) => sum + Number(a.blunders || 0), 0)
  const previousBlunderRate = previousAnalyses.length > 0 ? previousBlunders / previousAnalyses.length : 0
  
  const cplDelta = (recentAvgCpl !== null && previousAvgCpl !== null)
    ? recentAvgCpl - previousAvgCpl
    : null
  const blunderRateDelta = recentBlunderRate - previousBlunderRate
  
  // Engine Info
  const engineRow = engineInfoResult[0] || {}
  const engineInfo = {
    engineName: String(engineRow.engine_name || 'stockfish'),
    engineVersion: engineRow.engine_version ? String(engineRow.engine_version) : null,
    analysisDepth: Number(engineRow.analysis_depth || 15)
  }

  return {
    id: summaryId,
    computedAt: now.toISOString(),
    gameCountUsed: gamesWithEngineAnalysis,
    totalGames,
    gamesWithEngineAnalysis,
    coveragePercent,
    overall: {
      avgCentipawnLoss: avgCentipawnLoss,
      blunderRate,
      mistakeRate,
      inaccuracyRate,
      avgEvalSwingMax
    },
    byPhase: {
      opening: {
        avgCpl: openingAvgCpl,
        blunderRate: openingBlunderRate,
        gamesInPhase: openingCount
      },
      middlegame: {
        avgCpl: middlegameAvgCpl,
        blunderRate: middlegameBlunderRate,
        gamesInPhase: middlegameCount
      },
      endgame: {
        avgCpl: endgameAvgCpl,
        blunderRate: endgameBlunderRate,
        gamesInPhase: endgameCount
      }
    },
    trends: {
      recent50: {
        avgCpl: recentAvgCpl,
        blunderRate: recentBlunderRate
      },
      previous50: {
        avgCpl: previousAvgCpl,
        blunderRate: previousBlunderRate
      },
      cplDelta,
      blunderRateDelta
    },
    engineInfo
  }
}

/**
 * Create empty engine summary for when no analysis exists
 */
function createEmptyEngineSummary(summaryId: string, totalGames: number): EngineSummary {
  const now = new Date()
  
  return {
    id: summaryId,
    computedAt: now.toISOString(),
    gameCountUsed: 0,
    totalGames,
    gamesWithEngineAnalysis: 0,
    coveragePercent: 0,
    overall: {
      avgCentipawnLoss: null,
      blunderRate: 0,
      mistakeRate: 0,
      inaccuracyRate: 0,
      avgEvalSwingMax: null
    },
    byPhase: {
      opening: {
        avgCpl: null,
        blunderRate: 0,
        gamesInPhase: 0
      },
      middlegame: {
        avgCpl: null,
        blunderRate: 0,
        gamesInPhase: 0
      },
      endgame: {
        avgCpl: null,
        blunderRate: 0,
        gamesInPhase: 0
      }
    },
    trends: {
      recent50: {
        avgCpl: null,
        blunderRate: 0
      },
      previous50: {
        avgCpl: null,
        blunderRate: 0
      },
      cplDelta: null,
      blunderRateDelta: 0
    },
    engineInfo: {
      engineName: 'stockfish',
      engineVersion: null,
      analysisDepth: 15
    }
  }
}

/**
 * Run engine summary batch analysis and store result
 */
export async function runEngineSummaryAnalysis(): Promise<EngineSummary> {
  console.log('🔄 Computing engine summary...')
  
  const summary = await computeEngineSummary()
  
  console.log('💾 Storing engine summary...')
  await storeEngineSummary(summary)
  
  console.log('✅ Engine summary completed')
  return summary
}
