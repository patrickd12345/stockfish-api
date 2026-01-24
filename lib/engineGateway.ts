import path from 'path';
import { getEntitlementForUser, type Entitlement } from './billing';
import { checkAndIncrementBudget, estimateCpuMs, recordUsageWithAdjustment } from './budget';
import { FeatureAccessError, requireFeatureForUser } from './featureGate/server';
import { analyzeGameWithEngineInternal, type EngineAnalysisResult } from './engineAnalysis';
import { analyzeBlunderDnaFromGamesInternal } from './blunderDna';
import { storeEngineAnalysis } from './engineStorage';
import { getSql } from './database';
import { Chess } from 'chess.js';

export interface AnalysisParams {
  userId: string;
  type: 'game' | 'blunder-dna' | 'batch';
  // Game analysis params
  gameIds?: string[];
  gameId?: string;
  pgnText?: string;
  playerNames?: string[];
  depth?: number;
  multiPv?: number;
  // Blunder DNA params
  lichessGames?: Array<{ lichessGameId: string; pgn: string; timeControl: string | null; createdAt: string | null }>;
  thresholdCp?: number;
  nPerPattern?: number;
  // Batch params
  limit?: number;
}

export interface AnalysisResult {
  ok: boolean;
  jobId?: string;
  result?: EngineAnalysisResult | any;
  budgetRemaining?: number;
  error?: string;
}

/**
 * SINGLE POINT OF ENTRY for all server-side Stockfish execution.
 * This function MUST be called for any server-side engine work.
 * It enforces entitlement and budget checks.
 */
export async function executeServerSideAnalysis(
  params: AnalysisParams
): Promise<AnalysisResult> {
  const { userId, type } = params;
  
  // Validate userId is authenticated
  if (!userId) {
    throw new Error('Authentication required');
  }
  const featureKey =
    type === 'blunder-dna' ? 'blunder_dna' : type === 'batch' ? 'batch_analysis' : 'engine_analysis'
  try {
    await requireFeatureForUser(featureKey, { userId })
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      throw new Error(error.message)
    }
    throw error
  }
  const entitlement = await getEntitlementForUser(userId);
  
  // Resolve Stockfish path
  const stockfishPath =
    process.env.STOCKFISH_PATH?.trim() ||
    (process.platform === 'win32'
      ? path.join(process.cwd(), 'stockfish.exe')
      : path.join(process.cwd(), 'stockfish'));
  
  // Route to appropriate analysis function
  if (type === 'game') {
    return await executeGameAnalysis(params, entitlement, stockfishPath);
  } else if (type === 'blunder-dna') {
    return await executeBlunderDnaAnalysis(params, entitlement, stockfishPath);
  } else if (type === 'batch') {
    return await executeBatchAnalysis(params, entitlement, stockfishPath);
  } else {
    throw new Error(`Unknown analysis type: ${type}`);
  }
}

async function executeGameAnalysis(
  params: AnalysisParams,
  entitlement: Entitlement,
  stockfishPath: string
): Promise<AnalysisResult> {
  const { userId, gameIds, gameId, pgnText, playerNames, depth = 15, multiPv } = params;
  
  // Validate depth limits for Pro
  const maxDepth = 25;
  const analysisDepth = Math.min(Math.max(8, depth || 15), maxDepth);
  
  // Get PGN text
  let pgnToAnalyze: string | null = null;
  let gameIdToUse: string | null = null;
  
  if (pgnText) {
    pgnToAnalyze = pgnText;
  } else if (gameId) {
    // Fetch PGN from database
    const sql = getSql();
    const rows = await sql`
      SELECT pgn_text FROM games WHERE id = ${gameId}::uuid
    `;
    if (rows.length === 0) {
      return { ok: false, error: 'Game not found' };
    }
    pgnToAnalyze = rows[0].pgn_text as string;
    gameIdToUse = gameId;
  } else if (gameIds && gameIds.length > 0) {
    // For multiple games, we'll process the first one (or enqueue jobs)
    // For now, process first game
    const sql = getSql();
    const rows = await sql`
      SELECT id, pgn_text FROM games WHERE id = ANY(${gameIds}::uuid[])
      LIMIT 1
    `;
    if (rows.length === 0) {
      return { ok: false, error: 'No games found' };
    }
    pgnToAnalyze = rows[0].pgn_text as string;
    gameIdToUse = rows[0].id as string;
  } else {
    return { ok: false, error: 'Must provide pgnText, gameId, or gameIds' };
  }
  
  if (!pgnToAnalyze) {
    return { ok: false, error: 'No PGN text available' };
  }
  
  // Check if analysis already exists (cache check)
  if (gameIdToUse) {
    const sql = getSql();
    const existingRows = await sql`
      SELECT id FROM engine_analysis
      WHERE game_id = ${gameIdToUse}::uuid
        AND analysis_depth = ${analysisDepth}
        AND analysis_failed = false
    `;
    if (existingRows.length > 0) {
      return {
        ok: true,
        result: { cached: true },
        budgetRemaining: await getRemainingBudget(userId),
      };
    }
  }
  
  // Estimate CPU time
  const chess = new Chess();
  try {
    chess.loadPgn(pgnToAnalyze);
  } catch (e) {
    return { ok: false, error: `Invalid PGN: ${e}` };
  }
  const gameLength = chess.history().length;
  const estimatedCpuMs = estimateCpuMs(analysisDepth, gameLength, 'game');
  
  // Check and reserve budget
  const budgetCheck = await checkAndIncrementBudget(userId, estimatedCpuMs);
  if (!budgetCheck.allowed) {
    return {
      ok: false,
      error: budgetCheck.error || 'Budget exceeded',
      budgetRemaining: budgetCheck.remaining,
    };
  }
  
  // Execute analysis
  const startTime = Date.now();
  try {
    const defaultPlayerNames = playerNames || ['user'];
    const result = await analyzeGameWithEngineInternal(
      pgnToAnalyze,
      stockfishPath,
      defaultPlayerNames,
      analysisDepth
    );
    
    // Record actual CPU usage
    const actualCpuMs = Date.now() - startTime; // Approximate
    await recordUsageWithAdjustment(userId, estimatedCpuMs, actualCpuMs, 'game');
    
    // Store results if we have a gameId
    if (gameIdToUse) {
      await storeEngineAnalysis(gameIdToUse, result, 'stockfish');
    }
    
    return {
      ok: true,
      result,
      budgetRemaining: await getRemainingBudget(userId),
    };
  } catch (error: any) {
    // Adjust budget: subtract the reserved estimate since we failed
    await recordUsageWithAdjustment(userId, estimatedCpuMs, 0, 'game');
    return {
      ok: false,
      error: error.message || 'Analysis failed',
      budgetRemaining: await getRemainingBudget(userId),
    };
  }
}

async function executeBlunderDnaAnalysis(
  params: AnalysisParams,
  entitlement: Entitlement,
  stockfishPath: string
): Promise<AnalysisResult> {
  const { userId, lichessGames, depth = 10, thresholdCp = 150, nPerPattern = 3 } = params;
  
  if (!lichessGames || lichessGames.length === 0) {
    return { ok: false, error: 'No games provided for Blunder DNA analysis' };
  }
  
  // Estimate CPU time (rough estimate for multiple games)
  let totalGameLength = 0;
  for (const game of lichessGames) {
    const chess = new Chess();
    try {
      chess.loadPgn(game.pgn);
      totalGameLength += chess.history().length;
    } catch {
      // Skip invalid games
    }
  }
  const estimatedCpuMs = estimateCpuMs(depth || 10, totalGameLength, 'blunder-dna');
  
  // Check and reserve budget
  const budgetCheck = await checkAndIncrementBudget(userId, estimatedCpuMs);
  if (!budgetCheck.allowed) {
    return {
      ok: false,
      error: budgetCheck.error || 'Budget exceeded',
      budgetRemaining: budgetCheck.remaining,
    };
  }
  
  // Execute analysis
  const startTime = Date.now();
  try {
    const result = await analyzeBlunderDnaFromGamesInternal({
      lichessUserId: userId,
      games: lichessGames,
      stockfishPath,
      depth: depth || 10,
      thresholdCp: thresholdCp || 150,
      nPerPattern: nPerPattern || 3,
    });
    
    // Record actual CPU usage
    const actualCpuMs = Date.now() - startTime;
    await recordUsageWithAdjustment(userId, estimatedCpuMs, actualCpuMs, 'blunder-dna');
    
    return {
      ok: true,
      result,
      budgetRemaining: await getRemainingBudget(userId),
    };
  } catch (error: any) {
    // Adjust budget: subtract the reserved estimate since we failed
    await recordUsageWithAdjustment(userId, estimatedCpuMs, 0, 'blunder-dna');
    return {
      ok: false,
      error: error.message || 'Blunder DNA analysis failed',
      budgetRemaining: await getRemainingBudget(userId),
    };
  }
}

async function executeBatchAnalysis(
  params: AnalysisParams,
  entitlement: Entitlement,
  stockfishPath: string
): Promise<AnalysisResult> {
  // Batch analysis would enqueue jobs rather than execute inline
  // For now, return an error suggesting to use the queue system
  return {
    ok: false,
    error: 'Batch analysis should be enqueued via /api/engine/analyze with mode=enqueue',
  };
}

async function getRemainingBudget(userId: string): Promise<number> {
  try {
    const { getUsageForPeriod } = await import('./budget');
    const usage = await getUsageForPeriod(userId);
    return usage.remaining;
  } catch {
    return 0;
  }
}

// Re-export internal functions for backward compatibility during migration
// These will be removed once all callers use executeServerSideAnalysis
export { analyzeGameWithEngineInternal as analyzeGameWithEngine };
export { analyzeBlunderDnaFromGamesInternal as analyzeBlunderDnaFromGames };
