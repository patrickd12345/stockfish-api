import { Chess } from 'chess.js'
import { resolveStockfishPath, StockfishEngine } from '@/lib/stockfish'

// Phase 1 thresholds (centipawns)
const BLUNDER_THRESHOLD = 200
const MISTAKE_THRESHOLD = 100
const INACCURACY_THRESHOLD = 50

// Phase boundaries (move numbers)
const OPENING_END = 15
const MIDDLEGAME_END = 30

export interface EngineAnalysisResult {
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
  
  // Phase 2 data (factual snapshots only)
  criticalMoments: CriticalMoment[]
  missedTactics: MissedTactic[]
  timeTroubleIndicators: TimeTroubleIndicator[]
  pvSnapshots: PVSnapshot[]
  blunderDetails: BlunderDetail[]
  
  // Metadata
  engineVersion: string | null
  analysisDepth: number
}

export interface CriticalMoment {
  moveNumber: number
  ply: number
  fen: string
  evalBefore: number
  evalAfter: number
  swingMagnitude: number
}

export interface MissedTactic {
  moveNumber: number
  ply: number
  fen: string
  playedMove: string
  bestMove: string | null
  deltaMagnitude: number
}

export interface TimeTroubleIndicator {
  moveNumber: number
  ply: number
  isBlunder: boolean
  evalSwing: number
}

export interface PVSnapshot {
  moveNumber: number
  ply: number
  fen: string
  principalVariation: string[]
  depth: number
}

export interface BlunderDetail {
  moveNumber: number
  ply: number
  fen: string
  playedMove: string
  bestMove: string | null
  evalBefore: number
  evalAfter: number
  bestEval: number | null
  centipawnLoss: number
}

/**
 * Analyze a single game with Stockfish engine
 * This is a FACT GENERATION function - no narration, no interpretation
 */
export async function analyzeGameWithEngine(
  pgnText: string,
  stockfishPath: string,
  playerNames: string[],
  analysisDepth: number = 15
): Promise<EngineAnalysisResult> {
  const chess = new Chess()
  
  try {
    chess.loadPgn(pgnText)
  } catch (error) {
    throw new Error(`Failed to load PGN: ${error}`)
  }
  
  const headers = chess.header()
  const normalizedPlayerNames = playerNames.map(name => name.trim().toLowerCase())
  const whiteName = (headers.White || '').toLowerCase()
  const blackName = (headers.Black || '').toLowerCase()
  
  const isPlayerWhite = normalizedPlayerNames.some(name => whiteName.includes(name))
  const isPlayerBlack = normalizedPlayerNames.some(name => blackName.includes(name))
  const playerColor = isPlayerWhite ? 'white' : isPlayerBlack ? 'black' : null
  
  if (!playerColor) {
    throw new Error(`Cannot identify player in game: white="${headers.White}", black="${headers.Black}"`)
  }
  
  const enginePath = resolveStockfishPath(stockfishPath)
  const engine = new ExtendedStockfishEngine(enginePath)
  
  try {
    await engine.start()
    
    // Get engine version
    const versionInfo = await engine.getVersion()
    
    const history = chess.history({ verbose: true })
    const gameLength = history.length
    
    // Phase 1 metrics
    const centipawnLosses: number[] = []
    const openingLosses: number[] = []
    const middlegameLosses: number[] = []
    const endgameLosses: number[] = []
    let blunders = 0
    let mistakes = 0
    let inaccuracies = 0
    let maxEvalSwing = 0
    
    // Phase 2 data
    const criticalMoments: CriticalMoment[] = []
    const missedTactics: MissedTactic[] = []
    const timeTroubleIndicators: TimeTroubleIndicator[] = []
    const pvSnapshots: PVSnapshot[] = []
    const blunderDetails: BlunderDetail[] = []
    
    const tempChess = new Chess()
    let ply = 0
    let prevEval: number | null = null
    
    for (const move of history) {
      const moveNumber = Math.ceil((ply + 1) / 2)
      const isPlayerMove = (playerColor === 'white' && ply % 2 === 0) ||
                           (playerColor === 'black' && ply % 2 === 1)
      
      if (isPlayerMove) {
        // Evaluate position before move
        const fenBeforeMove = tempChess.fen()
        const evalBefore = await evaluatePosition(engine, fenBeforeMove, tempChess.turn(), analysisDepth)
        
        // Get best move and evaluation BEFORE making the move
        const { bestMove, evalAfter: bestEval, principalVariation } = await getBestMove(
          engine,
          fenBeforeMove,
          tempChess.turn(),
          analysisDepth
        )
        
        // Make the actual move
        tempChess.move(move.san)
        
        // Evaluate position after move
        const evalAfter = await evaluatePosition(engine, tempChess.fen(), tempChess.turn(), analysisDepth)
        
        // Calculate centipawn loss (difference between best move and actual move)
        const cpl = calculateCentipawnLoss(evalBefore, evalAfter, playerColor)
        
        // Calculate missed tactic delta (difference between best eval and actual eval)
        const missedTacticDelta = Math.abs(bestEval - evalAfter)
        centipawnLosses.push(cpl)
        
        // Categorize error
        if (cpl > BLUNDER_THRESHOLD) {
          blunders++
          blunderDetails.push({
            moveNumber,
            ply,
            fen: fenBeforeMove,
            playedMove: move.san,
            bestMove,
            evalBefore,
            evalAfter,
            bestEval,
            centipawnLoss: cpl
          })
        } else if (cpl > MISTAKE_THRESHOLD) {
          mistakes++
        } else if (cpl > INACCURACY_THRESHOLD) {
          inaccuracies++
        }
        
        // Phase-specific CPL
        if (moveNumber <= OPENING_END) {
          openingLosses.push(cpl)
        } else if (moveNumber <= MIDDLEGAME_END) {
          middlegameLosses.push(cpl)
        } else {
          endgameLosses.push(cpl)
        }
        
        // Track evaluation swings
        if (prevEval !== null) {
          const swing = Math.abs(evalAfter - prevEval)
          maxEvalSwing = Math.max(maxEvalSwing, swing)
          
          // Critical moment detection (large swing)
          if (swing > 300) {
            criticalMoments.push({
              moveNumber,
              ply,
              fen: tempChess.fen(),
              evalBefore: prevEval,
              evalAfter,
              swingMagnitude: swing
            })
          }
        }
        
        // Missed tactic detection (if played move is significantly worse than best move)
        if (bestMove && bestMove !== move.san && missedTacticDelta > 100) {
          missedTactics.push({
            moveNumber,
            ply,
            fen: tempChess.fen(),
            playedMove: move.san,
            bestMove,
            deltaMagnitude: missedTacticDelta
          })
        }
        
        // Time trouble indicators (late-game blunders)
        if (moveNumber > 30 && cpl > BLUNDER_THRESHOLD) {
          timeTroubleIndicators.push({
            moveNumber,
            ply,
            isBlunder: true,
            evalSwing: cpl
          })
        }
        
        // PV snapshots (limited, every 10 moves) - store the PV from before the move
        if (moveNumber % 10 === 0 && principalVariation.length > 0) {
          // Store FEN before the move for context
          const fenBeforeMove = tempChess.fen()
          // Undo the move to get the position before
          tempChess.undo()
          pvSnapshots.push({
            moveNumber,
            ply: ply - 1,
            fen: tempChess.fen(),
            principalVariation: principalVariation.slice(0, 5), // Limit to 5 moves
            depth: analysisDepth
          })
          // Redo the move
          tempChess.move(move.san)
        }
        
        prevEval = evalAfter
      } else {
        tempChess.move(move.san)
      }
      
      ply++
    }
    
    // Calculate averages
    const avgCpl = centipawnLosses.length > 0
      ? centipawnLosses.reduce((sum, cpl) => sum + cpl, 0) / centipawnLosses.length
      : null
    
    const openingCpl = openingLosses.length > 0
      ? openingLosses.reduce((sum, cpl) => sum + cpl, 0) / openingLosses.length
      : null
    
    const middlegameCpl = middlegameLosses.length > 0
      ? middlegameLosses.reduce((sum, cpl) => sum + cpl, 0) / middlegameLosses.length
      : null
    
    const endgameCpl = endgameLosses.length > 0
      ? endgameLosses.reduce((sum, cpl) => sum + cpl, 0) / endgameLosses.length
      : null
    
    return {
      avgCentipawnLoss: avgCpl,
      blunders,
      mistakes,
      inaccuracies,
      evalSwingMax: maxEvalSwing > 0 ? maxEvalSwing : null,
      openingCpl,
      middlegameCpl,
      endgameCpl,
      gameLength,
      criticalMoments,
      missedTactics,
      timeTroubleIndicators,
      pvSnapshots,
      blunderDetails,
      engineVersion: versionInfo,
      analysisDepth
    }
  } finally {
    await engine.stop()
  }
}

/**
 * Extended Stockfish engine wrapper for depth-based analysis
 * Uses composition to access private methods
 */
class ExtendedStockfishEngine {
  private engine: StockfishEngine
  
  constructor(enginePath: string) {
    this.engine = new StockfishEngine(enginePath)
  }
  
  async start(): Promise<void> {
    return this.engine.start()
  }
  
  async stop(): Promise<void> {
    return this.engine.stop()
  }
  
  async evaluateDepth(fen: string, sideToMove: 'w' | 'b', depth: number): Promise<number> {
    // Access private methods via type assertion
    const engine = this.engine as any
    const wait = engine.waitFor(
      (line: string): boolean => line.startsWith('bestmove'),
      30000
    )
    
    engine.send(`position fen ${fen}`)
    engine.send(`go depth ${depth}`)
    
    const lines = await wait
    const score = parseScoreFromLines(lines)
    return sideToMove === 'b' ? -score : score
  }
  
  async getBestMoveAndPV(fen: string, sideToMove: 'w' | 'b', depth: number): Promise<{
    bestMove: string | null
    evalAfter: number
    principalVariation: string[]
  }> {
    const engine = this.engine as any
    const wait = engine.waitFor(
      (line: string): boolean => line.startsWith('bestmove'),
      30000
    )
    
    engine.send(`position fen ${fen}`)
    engine.send(`go depth ${depth}`)
    
    const lines = await wait
    const score = parseScoreFromLines(lines)
    const evalAfter = sideToMove === 'b' ? -score : score
    
    // Extract best move
    const bestMoveLine = lines.find((line: string) => line.startsWith('bestmove'))
    const bestMove = bestMoveLine?.match(/bestmove\s+(\S+)/)?.[1] || null
    
    // Extract principal variation
    const pvLine = lines.find((line: string) => line.startsWith('info') && line.includes('pv'))
    const pv = pvLine?.match(/pv\s+(.+)/)?.[1]?.split(/\s+/) || []
    
    return {
      bestMove,
      evalAfter,
      principalVariation: pv
    }
  }
  
  async getVersion(): Promise<string | null> {
    const engine = this.engine as any
    try {
      const wait = engine.waitFor(
        (line: string): boolean => line.includes('Stockfish') || line.startsWith('id name'),
        5000
      )
      engine.send('uci')
      const lines = await wait
      const versionLine = lines.find((line: string) => line.includes('Stockfish') || line.startsWith('id name'))
      return versionLine?.match(/Stockfish\s+(\S+)/)?.[1] || versionLine?.replace('id name ', '') || null
    } catch {
      return null
    }
  }
}

/**
 * Evaluate a position using Stockfish
 */
async function evaluatePosition(
  engine: ExtendedStockfishEngine,
  fen: string,
  sideToMove: 'w' | 'b',
  depth: number
): Promise<number> {
  return engine.evaluateDepth(fen, sideToMove, depth)
}

/**
 * Get best move and principal variation
 */
async function getBestMove(
  engine: ExtendedStockfishEngine,
  fen: string,
  sideToMove: 'w' | 'b',
  depth: number
): Promise<{ bestMove: string | null; evalAfter: number; principalVariation: string[] }> {
  return engine.getBestMoveAndPV(fen, sideToMove, depth)
}


/**
 * Parse score from Stockfish output lines
 */
function parseScoreFromLines(lines: string[]): number {
  const MATE_SCORE = 100000
  let lastScore: number | null = null
  
  for (const line of lines) {
    const cpMatch = line.match(/score\s+cp\s+(-?\d+)/)
    if (cpMatch) {
      lastScore = parseInt(cpMatch[1], 10)
      continue
    }
    const mateMatch = line.match(/score\s+mate\s+(-?\d+)/)
    if (mateMatch) {
      const mate = parseInt(mateMatch[1], 10)
      lastScore = mate > 0 ? MATE_SCORE : -MATE_SCORE
    }
  }
  
  return lastScore ?? 0
}

/**
 * Calculate centipawn loss
 */
function calculateCentipawnLoss(
  evalBefore: number,
  evalAfter: number,
  playerColor: 'white' | 'black'
): number {
  const beforePov = playerColor === 'white' ? evalBefore : -evalBefore
  const afterPov = playerColor === 'white' ? evalAfter : -evalAfter
  const loss = beforePov - afterPov
  return Math.max(0, Math.round(loss))
}
