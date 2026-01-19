import { connectToDb, getSql } from '@/lib/database'
import { EngineAnalysisResult } from '@/lib/engineAnalysis'
import { storeBlunderDetails } from '@/lib/blunderStorage'

export interface StoredEngineAnalysis {
  id: string
  gameId: string
  engineName: string
  engineVersion: string | null
  analysisDepth: number
  analyzedAt: Date
  
  // Phase 1 metrics
  avgCentipawnLoss: number | null
  blunders: number
  mistakes: number
  inaccuracies: number
  evalSwingMax: number | null
  openingCpl: number | null
  middlegameCpl: number | null
  endgameCpl: number | null
  gameLength: number
  
  // Phase 2 data
  hasFullAnalysis: boolean
  criticalMoments: any
  missedTactics: any
  timeTroubleIndicators: any
  pvSnapshots: any
  
  // Failure handling
  analysisFailed: boolean
  failureReason: string | null
}

/**
 * Store engine analysis results in database
 */
export async function storeEngineAnalysis(
  gameId: string,
  result: EngineAnalysisResult,
  engineName: string = 'stockfish'
): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  await sql`
    INSERT INTO engine_analysis (
      game_id,
      engine_name,
      engine_version,
      analysis_depth,
      avg_centipawn_loss,
      blunders,
      mistakes,
      inaccuracies,
      eval_swing_max,
      opening_cpl,
      middlegame_cpl,
      endgame_cpl,
      game_length,
      has_full_analysis,
      critical_moments,
      missed_tactics,
      time_trouble_indicators,
      pv_snapshots,
      analysis_failed,
      failure_reason
    ) VALUES (
      ${gameId}::uuid,
      ${engineName},
      ${result.engineVersion || null},
      ${result.analysisDepth},
      ${result.avgCentipawnLoss},
      ${result.blunders},
      ${result.mistakes},
      ${result.inaccuracies},
      ${result.evalSwingMax},
      ${result.openingCpl},
      ${result.middlegameCpl},
      ${result.endgameCpl},
      ${result.gameLength},
      ${result.criticalMoments.length > 0 || result.missedTactics.length > 0},
      ${JSON.stringify(result.criticalMoments)}::jsonb,
      ${JSON.stringify(result.missedTactics)}::jsonb,
      ${JSON.stringify(result.timeTroubleIndicators)}::jsonb,
      ${JSON.stringify(result.pvSnapshots)}::jsonb,
      false,
      null
    )
    ON CONFLICT (game_id, engine_name, engine_version, analysis_depth)
    DO UPDATE SET
      avg_centipawn_loss = EXCLUDED.avg_centipawn_loss,
      blunders = EXCLUDED.blunders,
      mistakes = EXCLUDED.mistakes,
      inaccuracies = EXCLUDED.inaccuracies,
      eval_swing_max = EXCLUDED.eval_swing_max,
      opening_cpl = EXCLUDED.opening_cpl,
      middlegame_cpl = EXCLUDED.middlegame_cpl,
      endgame_cpl = EXCLUDED.endgame_cpl,
      game_length = EXCLUDED.game_length,
      has_full_analysis = EXCLUDED.has_full_analysis,
      critical_moments = EXCLUDED.critical_moments,
      missed_tactics = EXCLUDED.missed_tactics,
      time_trouble_indicators = EXCLUDED.time_trouble_indicators,
      pv_snapshots = EXCLUDED.pv_snapshots,
      analysis_failed = EXCLUDED.analysis_failed,
      failure_reason = EXCLUDED.failure_reason,
      analyzed_at = now(),
      updated_at = now()
  `

  // Keep the `games` table in sync so "blunders" is always a concrete number
  // once Stockfish has analyzed the game.
  await sql`
    UPDATE games
    SET
      blunders = ${result.blunders}
    WHERE id = ${gameId}::uuid
  `

  await storeBlunderDetails(gameId, engineName, result.analysisDepth, result.blunderDetails ?? [])
}

/**
 * Mark analysis as failed
 */
export async function markAnalysisFailed(
  gameId: string,
  reason: string,
  engineName: string = 'stockfish',
  engineVersion: string | null = null,
  analysisDepth: number = 15
): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  await sql`
    INSERT INTO engine_analysis (
      game_id,
      engine_name,
      engine_version,
      analysis_depth,
      analysis_failed,
      failure_reason
    ) VALUES (
      ${gameId}::uuid,
      ${engineName},
      ${engineVersion || null},
      ${analysisDepth},
      true,
      ${reason}
    )
    ON CONFLICT (game_id, engine_name, engine_version, analysis_depth)
    DO UPDATE SET
      analysis_failed = true,
      failure_reason = EXCLUDED.failure_reason,
      analyzed_at = now(),
      updated_at = now()
  `
}

/**
 * Get games that need engine analysis
 */
export async function getGamesNeedingAnalysis(
  limit: number = 100,
  engineName: string = 'stockfish',
  analysisDepth: number = 15
): Promise<Array<{ id: string; pgn_text: string; white: string | null; black: string | null }>> {
  await connectToDb()
  const sql = getSql()
  
  const games = (await sql`
    SELECT g.id, g.pgn_text, g.white, g.black
    FROM games g
    LEFT JOIN engine_analysis ea ON g.id = ea.game_id 
      AND ea.engine_name = ${engineName}
      AND ea.analysis_depth = ${analysisDepth}
      AND ea.analysis_failed = false
    WHERE ea.id IS NULL
      AND g.pgn_text IS NOT NULL
      AND g.pgn_text != ''
    ORDER BY g.created_at DESC
    LIMIT ${limit}
  `) as Array<{ id: string; pgn_text: string; white: string | null; black: string | null }>
  
  return games.map((row) => ({
    id: String(row.id),
    pgn_text: String(row.pgn_text),
    white: row.white ? String(row.white) : null,
    black: row.black ? String(row.black) : null
  }))
}

/**
 * Get analysis coverage statistics
 */
export async function getAnalysisCoverage(
  engineName: string = 'stockfish',
  analysisDepth: number = 15
): Promise<{
  totalGames: number
  analyzedGames: number
  failedGames: number
  pendingGames: number
}> {
  await connectToDb()
  const sql = getSql()
  
  const stats = (await sql`
    SELECT 
      COUNT(DISTINCT g.id) as total_games,
      COUNT(DISTINCT CASE WHEN ea.id IS NOT NULL AND ea.analysis_failed = false THEN g.id END) as analyzed_games,
      COUNT(DISTINCT CASE WHEN ea.analysis_failed = true THEN g.id END) as failed_games
    FROM games g
    LEFT JOIN engine_analysis ea ON g.id = ea.game_id 
      AND ea.engine_name = ${engineName}
      AND ea.analysis_depth = ${analysisDepth}
  `) as Array<{ total_games: number; analyzed_games: number; failed_games: number }>
  
  const row = stats[0]
  const totalGames = Number(row.total_games) || 0
  const analyzedGames = Number(row.analyzed_games) || 0
  const failedGames = Number(row.failed_games) || 0
  const pendingGames = totalGames - analyzedGames - failedGames
  
  return {
    totalGames,
    analyzedGames,
    failedGames,
    pendingGames
  }
}
