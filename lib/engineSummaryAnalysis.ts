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
  
  // Get all successful engine analyses
  const analyses = (await sql`
    SELECT 
      id,
      game_id,
      avg_centipawn_loss,
      blunders,
      mistakes,
      inaccuracies,
      eval_swing_max,
      opening_cpl,
      middlegame_cpl,
      endgame_cpl,
      game_length,
      engine_name,
      engine_version,
      analysis_depth,
      analyzed_at
    FROM engine_analysis
    WHERE analysis_failed = false
    ORDER BY analyzed_at ASC
  `) as DbRow[]
  
  const gamesWithEngineAnalysis = analyses.length
  const coveragePercent = totalGames > 0 ? (gamesWithEngineAnalysis / totalGames) * 100 : 0
  
  if (analyses.length === 0) {
    return createEmptyEngineSummary(summaryId, totalGames)
  }
  
  // Convert to typed rows
  const typedAnalyses: EngineAnalysisRow[] = analyses.map(row => ({
    id: String(row.id),
    game_id: String(row.game_id),
    avg_centipawn_loss: row.avg_centipawn_loss ? Number(row.avg_centipawn_loss) : null,
    blunders: Number(row.blunders || 0),
    mistakes: Number(row.mistakes || 0),
    inaccuracies: Number(row.inaccuracies || 0),
    eval_swing_max: row.eval_swing_max ? Number(row.eval_swing_max) : null,
    opening_cpl: row.opening_cpl ? Number(row.opening_cpl) : null,
    middlegame_cpl: row.middlegame_cpl ? Number(row.middlegame_cpl) : null,
    endgame_cpl: row.endgame_cpl ? Number(row.endgame_cpl) : null,
    game_length: Number(row.game_length || 0),
    engine_name: String(row.engine_name || 'stockfish'),
    engine_version: row.engine_version ? String(row.engine_version) : null,
    analysis_depth: Number(row.analysis_depth || 15),
    analyzed_at: row.analyzed_at as Date
  }))
  
  // Get engine info from first analysis
  const firstAnalysis = typedAnalyses[0]
  const engineInfo = {
    engineName: firstAnalysis.engine_name,
    engineVersion: firstAnalysis.engine_version,
    analysisDepth: firstAnalysis.analysis_depth
  }
  
  // Overall metrics
  const analysesWithCpl = typedAnalyses.filter(a => a.avg_centipawn_loss !== null)
  const avgCentipawnLoss = analysesWithCpl.length > 0
    ? analysesWithCpl.reduce((sum, a) => sum + (a.avg_centipawn_loss || 0), 0) / analysesWithCpl.length
    : null
  
  const totalBlunders = typedAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const totalMistakes = typedAnalyses.reduce((sum, a) => sum + a.mistakes, 0)
  const totalInaccuracies = typedAnalyses.reduce((sum, a) => sum + a.inaccuracies, 0)
  
  const blunderRate = gamesWithEngineAnalysis > 0 ? totalBlunders / gamesWithEngineAnalysis : 0
  const mistakeRate = gamesWithEngineAnalysis > 0 ? totalMistakes / gamesWithEngineAnalysis : 0
  const inaccuracyRate = gamesWithEngineAnalysis > 0 ? totalInaccuracies / gamesWithEngineAnalysis : 0
  
  const analysesWithEvalSwing = typedAnalyses.filter(a => a.eval_swing_max !== null)
  const avgEvalSwingMax = analysesWithEvalSwing.length > 0
    ? analysesWithEvalSwing.reduce((sum, a) => sum + (a.eval_swing_max || 0), 0) / analysesWithEvalSwing.length
    : null
  
  // Phase-specific metrics
  const openingAnalyses = typedAnalyses.filter(a => a.opening_cpl !== null)
  const openingAvgCpl = openingAnalyses.length > 0
    ? openingAnalyses.reduce((sum, a) => sum + (a.opening_cpl || 0), 0) / openingAnalyses.length
    : null
  const openingBlunders = openingAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const openingBlunderRate = openingAnalyses.length > 0 ? openingBlunders / openingAnalyses.length : 0
  
  const middlegameAnalyses = typedAnalyses.filter(a => a.middlegame_cpl !== null)
  const middlegameAvgCpl = middlegameAnalyses.length > 0
    ? middlegameAnalyses.reduce((sum, a) => sum + (a.middlegame_cpl || 0), 0) / middlegameAnalyses.length
    : null
  const middlegameBlunders = middlegameAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const middlegameBlunderRate = middlegameAnalyses.length > 0 ? middlegameBlunders / middlegameAnalyses.length : 0
  
  const endgameAnalyses = typedAnalyses.filter(a => a.endgame_cpl !== null)
  const endgameAvgCpl = endgameAnalyses.length > 0
    ? endgameAnalyses.reduce((sum, a) => sum + (a.endgame_cpl || 0), 0) / endgameAnalyses.length
    : null
  const endgameBlunders = endgameAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const endgameBlunderRate = endgameAnalyses.length > 0 ? endgameBlunders / endgameAnalyses.length : 0
  
  // Trends over time (recent 50 vs previous 50)
  const recentCount = Math.min(50, Math.floor(typedAnalyses.length / 2))
  const recentAnalyses = typedAnalyses.slice(-recentCount)
  const previousAnalyses = typedAnalyses.slice(-recentCount * 2, -recentCount)
  
  const recentWithCpl = recentAnalyses.filter(a => a.avg_centipawn_loss !== null)
  const recentAvgCpl = recentWithCpl.length > 0
    ? recentWithCpl.reduce((sum, a) => sum + (a.avg_centipawn_loss || 0), 0) / recentWithCpl.length
    : null
  const recentBlunders = recentAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const recentBlunderRate = recentAnalyses.length > 0 ? recentBlunders / recentAnalyses.length : 0
  
  const previousWithCpl = previousAnalyses.filter(a => a.avg_centipawn_loss !== null)
  const previousAvgCpl = previousWithCpl.length > 0
    ? previousWithCpl.reduce((sum, a) => sum + (a.avg_centipawn_loss || 0), 0) / previousWithCpl.length
    : null
  const previousBlunders = previousAnalyses.reduce((sum, a) => sum + a.blunders, 0)
  const previousBlunderRate = previousAnalyses.length > 0 ? previousBlunders / previousAnalyses.length : 0
  
  const cplDelta = (recentAvgCpl !== null && previousAvgCpl !== null)
    ? recentAvgCpl - previousAvgCpl
    : null
  const blunderRateDelta = recentBlunderRate - previousBlunderRate
  
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
        gamesInPhase: openingAnalyses.length
      },
      middlegame: {
        avgCpl: middlegameAvgCpl,
        blunderRate: middlegameBlunderRate,
        gamesInPhase: middlegameAnalyses.length
      },
      endgame: {
        avgCpl: endgameAvgCpl,
        blunderRate: endgameBlunderRate,
        gamesInPhase: endgameAnalyses.length
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
