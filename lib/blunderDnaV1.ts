/**
 * Blunder DNA v1 - Deterministic blunder pattern analysis
 * Uses existing engine evaluations only (no re-analysis)
 */

import type { BlunderDetail } from '@/lib/engineAnalysis'

// Re-export for convenience
export type { BlunderDetail }

/**
 * Blunder themes (deterministic classification)
 */
export enum BlunderTheme {
  HANGING_PIECE = 'hanging_piece',
  MISSED_THREAT = 'missed_threat',
  MISSED_WIN = 'missed_win',
  UNSAFE_KING = 'unsafe_king',
  BAD_CAPTURE = 'bad_capture',
  TIME_TROUBLE = 'time_trouble',
}

/**
 * Game phases (based on move number)
 */
export enum GamePhase {
  OPENING = 'opening',      // moves 1-15
  MIDDLEGAME = 'middlegame', // moves 16-30
  ENDGAME = 'endgame',      // moves 31+
}

/**
 * Blunder event detected from existing analysis
 */
export interface BlunderEvent {
  gameId: string
  moveNumber: number
  ply: number
  centipawnLoss: number
  evalBefore: number
  evalAfter: number
  theme: BlunderTheme
  phase: GamePhase
}

/**
 * Aggregated blunder pattern
 */
export interface BlunderPattern {
  theme: BlunderTheme
  phase: GamePhase
  count: number
  avgCentipawnLoss: number
  exampleGameIds: string[] // Up to 5
}

/**
 * Blunder DNA snapshot
 */
export interface BlunderDnaSnapshot {
  userId: string
  snapshotDate: string // YYYY-MM-DD
  gamesAnalyzed: number
  blundersTotal: number
  patterns: BlunderPattern[]
  computedAt: string
}

/**
 * Detect blunders from existing analysis data
 * Threshold: centipawn_loss >= 150 (1.5 pawns)
 */
export function detectBlunders(blunders: BlunderDetail[], gameId: string): BlunderEvent[] {
  const thresholdCp = 150
  const events: BlunderEvent[] = []

  for (const blunder of blunders) {
    if (blunder.centipawnLoss >= thresholdCp) {
      const phase = classifyPhase(blunder.moveNumber)
      const theme = classifyTheme(blunder)
      
      events.push({
        gameId,
        moveNumber: blunder.moveNumber,
        ply: blunder.ply,
        centipawnLoss: blunder.centipawnLoss,
        evalBefore: blunder.evalBefore,
        evalAfter: blunder.evalAfter,
        theme,
        phase,
      })
    }
  }

  return events
}

/**
 * Classify game phase based on move number
 */
export function classifyPhase(moveNumber: number): GamePhase {
  if (moveNumber <= 15) return GamePhase.OPENING
  if (moveNumber <= 30) return GamePhase.MIDDLEGAME
  return GamePhase.ENDGAME
}

/**
 * Classify blunder theme (deterministic rules)
 */
export function classifyTheme(blunder: BlunderDetail): BlunderTheme {
  const { evalBefore, evalAfter, centipawnLoss, playedMove } = blunder
  
  // Mate-like positions (unsafe king)
  if (Math.abs(evalBefore) >= 90000 || Math.abs(evalAfter) >= 90000) {
    return BlunderTheme.UNSAFE_KING
  }
  
  // Hanging piece (big one-move loss) - check before missed_threat
  if (centipawnLoss >= 300) {
    return BlunderTheme.HANGING_PIECE
  }
  
  // Bad capture (capture that loses material)
  const isCapture = playedMove.includes('x')
  if (isCapture && centipawnLoss >= 150) {
    return BlunderTheme.BAD_CAPTURE
  }
  
  // Missed win (had advantage, lost it)
  if (evalBefore >= 200 && centipawnLoss >= 150) {
    return BlunderTheme.MISSED_WIN
  }
  
  // Missed threat (neutral position, opponent gets advantage)
  if (evalBefore >= -100 && evalBefore <= 100 && evalAfter <= -150) {
    return BlunderTheme.MISSED_THREAT
  }
  
  // Default: missed threat
  return BlunderTheme.MISSED_THREAT
}

/**
 * Aggregate blunders by theme and phase
 */
export function aggregateBlunders(events: BlunderEvent[]): BlunderPattern[] {
  const groups = new Map<string, {
    theme: BlunderTheme
    phase: GamePhase
    losses: number[]
    gameIds: Set<string>
  }>()

  for (const event of events) {
    const key = `${event.theme}:${event.phase}`
    const group = groups.get(key) || {
      theme: event.theme,
      phase: event.phase,
      losses: [],
      gameIds: new Set<string>(),
    }
    
    group.losses.push(event.centipawnLoss)
    group.gameIds.add(event.gameId)
    groups.set(key, group)
  }

  const patterns: BlunderPattern[] = []
  
  for (const group of Array.from(groups.values())) {
    const avgLoss = group.losses.reduce((sum: number, loss: number) => sum + loss, 0) / group.losses.length
    const exampleGameIds = Array.from(group.gameIds).slice(0, 5) as string[]
    
    patterns.push({
      theme: group.theme,
      phase: group.phase,
      count: group.losses.length,
      avgCentipawnLoss: Math.round(avgLoss),
      exampleGameIds,
    })
  }

  // Sort by count descending, then by avg loss descending
  patterns.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return b.avgCentipawnLoss - a.avgCentipawnLoss
  })

  return patterns
}
