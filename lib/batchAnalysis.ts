import { Chess } from 'chess.js'
import { connectToDb, getSql } from '@/lib/database'
import { ProgressionSummary, OpeningStats, TrendDirection, PhasePerformance } from '@/types/ProgressionSummary'
import { storeProgressionSummary } from '@/lib/progressionStorage'

/**
 * Validate accuracy value
 * Must be a number between 0 and 100 inclusive
 */
export function isValidAccuracy(value: any): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 100
  )
}

/**
 * Validate blunder count
 * Must be a non-negative integer
 */
export function isValidBlunder(value: any): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  )
}

type DbRow = Record<string, unknown>

interface GameData {
  id: string
  date?: string
  white?: string
  black?: string
  result?: string
  opening_name?: string
  my_accuracy?: number
  blunders: number
  pgn_text: string
  created_at: Date
}

interface ProcessedGame extends GameData {
  gameDate: Date
  isWin: boolean
  isDraw: boolean
  isLoss: boolean
  isUnknown: boolean
  moveCount: number
  hasAccuracy: boolean
  hasBlunderData: boolean
}

/**
 * BATCH ANALYSIS PIPELINE
 * This is the ONLY function that should iterate over all games.
 * It is NEVER called during chat requests.
 */
export async function runBatchAnalysis(): Promise<ProgressionSummary> {
  console.log('🔄 Starting batch analysis pipeline...')
  
  try {
    await connectToDb()
    const sql = getSql()
    
    // Step 1: Load ALL games ordered by date
    console.log('📊 Loading all games from database...')
    const allGames = (await sql`
      SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, created_at
      FROM games
      ORDER BY 
        CASE WHEN date IS NOT NULL THEN date::date ELSE created_at::date END ASC
    `) as DbRow[]
    
    if (allGames.length === 0) {
      console.log('⚠️  No games found in database')
      return createEmptySummary()
    }
    
    console.log(`📈 Processing ${allGames.length} games...`)
    
    // Step 2: Process games in chunks to avoid memory issues
    const CHUNK_SIZE = 100
    const processedGames: ProcessedGame[] = []
    
    for (let i = 0; i < allGames.length; i += CHUNK_SIZE) {
      const chunk = allGames.slice(i, i + CHUNK_SIZE)
      console.log(`🔍 Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}/${Math.ceil(allGames.length / CHUNK_SIZE)}`)
      
      const processedChunk = chunk.map(game => processGame({
        id: String(game.id),
        date: game.date ? String(game.date) : undefined,
        white: game.white ? String(game.white) : undefined,
        black: game.black ? String(game.black) : undefined,
        result: game.result ? String(game.result) : undefined,
        opening_name: game.opening_name ? String(game.opening_name) : undefined,
        my_accuracy: game.my_accuracy ? Number(game.my_accuracy) : undefined,
        blunders: Number(game.blunders || 0),
        pgn_text: String(game.pgn_text),
        created_at: game.created_at as Date
      }))
      processedGames.push(...processedChunk)
    }
    
    // Step 3: Compute comprehensive statistics
    console.log('📊 Computing statistics...')
    const summary = await computeProgressionSummary(processedGames)
    
    // Step 4: Store the result
    console.log('💾 Storing progression summary...')
    await storeProgressionSummary(summary)
    
    console.log('✅ Batch analysis completed successfully')
    return summary
    
  } catch (error) {
    console.error('❌ Batch analysis failed:', error)
    throw error
  }
}

/**
 * Process a single game to extract metrics
 */
function processGame(game: GameData): ProcessedGame {
  // Determine game date
  const gameDate = game.date ? new Date(game.date) : game.created_at
  
  // CRITICAL: Fix result parsing - must be mutually exclusive
  const result = (game.result || '').trim()
  let isWin = false
  let isDraw = false
  let isLoss = false
  let isUnknown = false
  
  // Player identification - check environment variables for known player names
  const playerNames = [
    process.env.CHESS_PLAYER_NAMES?.split(',') || [],
    ['patrickd1234567', 'patrickd12345678', 'anonymous19670705'] // Fallback based on user hint
  ].flat().map(name => name.trim().toLowerCase())
  
  // Determine if player was white or black
  const white = (game.white || '').toLowerCase()
  const black = (game.black || '').toLowerCase()
  const playerIsWhite = playerNames.some(name => white.includes(name))
  const playerIsBlack = playerNames.some(name => black.includes(name))
  
  // Parse PGN results explicitly with proper player identification
  if (result === '1-0') {
    // White wins
    if (playerIsWhite) {
      isWin = true
    } else if (playerIsBlack) {
      isLoss = true
    } else {
      // Can't determine player color - mark as unknown
      console.warn(`Cannot determine player color for game ${game.id}: white="${white}", black="${black}"`)
      isUnknown = true
    }
  } else if (result === '0-1') {
    // Black wins
    if (playerIsBlack) {
      isWin = true
    } else if (playerIsWhite) {
      isLoss = true
    } else {
      // Can't determine player color - mark as unknown
      console.warn(`Cannot determine player color for game ${game.id}: white="${white}", black="${black}"`)
      isUnknown = true
    }
  } else if (result === '1/2-1/2') {
    // Draw - only count if we can identify the player
    if (playerIsWhite || playerIsBlack) {
      isDraw = true
    } else {
      console.warn(`Cannot determine player color for draw in game ${game.id}: white="${white}", black="${black}"`)
      isUnknown = true
    }
  } else if (result === '*' || result === '' || !result) {
    // Unfinished, abandoned, or missing result
    isUnknown = true
  } else {
    // Any other unexpected result format
    console.warn(`Unexpected result format: "${result}" for game ${game.id}`)
    isUnknown = true
  }
  
  // Count moves by parsing PGN
  let moveCount = 0
  try {
    const chess = new Chess()
    chess.loadPgn(game.pgn_text)
    moveCount = chess.history().length
  } catch (error) {
    // If PGN parsing fails, estimate from text
    const moves = game.pgn_text.match(/\d+\./g)
    moveCount = moves ? moves.length * 2 : 0
  }
  
  // CRITICAL: Fix accuracy and blunder data handling
  const accVal = game.my_accuracy !== null && game.my_accuracy !== undefined ? Number(game.my_accuracy) : undefined
  const hasAccuracy = isValidAccuracy(accVal)

  const blunderVal = game.blunders !== null && game.blunders !== undefined ? Number(game.blunders) : undefined
  const hasBlunderData = isValidBlunder(blunderVal)
  
  return {
    ...game,
    gameDate,
    isWin,
    isDraw,
    isLoss,
    isUnknown,
    moveCount,
    hasAccuracy,
    hasBlunderData,
    // Only use blunder count if we have valid data, otherwise exclude from averages
    blunders: hasBlunderData ? (blunderVal as number) : 0
  }
}

/**
 * Compute comprehensive progression summary from processed games
 */
async function computeProgressionSummary(games: ProcessedGame[]): Promise<ProgressionSummary> {
  const now = new Date()
  const summaryId = `batch-${now.getTime()}`
  
  // Basic stats
  const totalGames = games.length
  const firstGame = games[0]
  const lastGame = games[games.length - 1]
  
  const period = {
    start: firstGame.gameDate.toISOString().split('T')[0],
    end: lastGame.gameDate.toISOString().split('T')[0],
    days: Math.ceil((lastGame.gameDate.getTime() - firstGame.gameDate.getTime()) / (1000 * 60 * 60 * 24))
  }
  
  // Overall performance - CRITICAL: Results must be mutually exclusive
  const wins = games.filter(g => g.isWin).length
  const draws = games.filter(g => g.isDraw).length
  const losses = games.filter(g => g.isLoss).length
  const unknown = games.filter(g => g.isUnknown).length
  
  // HARD INVARIANT: Totals must be conserved
  const resultSum = wins + draws + losses + unknown
  if (resultSum !== totalGames) {
    throw new Error(`CRITICAL: Result totals don't match! wins(${wins}) + draws(${draws}) + losses(${losses}) + unknown(${unknown}) = ${resultSum}, but totalGames = ${totalGames}`)
  }
  
  console.log(`📊 Result breakdown: ${wins} wins, ${draws} draws, ${losses} losses, ${unknown} unknown/unfinished`)
  
  // CRITICAL: Only include games with valid accuracy data
  const gamesWithAccuracy = games.filter(g => g.hasAccuracy)
  const avgAccuracy = gamesWithAccuracy.length > 0
    ? gamesWithAccuracy.reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / gamesWithAccuracy.length
    : undefined
  
  console.log(`📊 Accuracy data: ${gamesWithAccuracy.length}/${totalGames} games have accuracy data`)
  
  // CRITICAL: Only include games with valid blunder data in averages
  const gamesWithBlunderData = games.filter(g => g.hasBlunderData)
  const avgBlunders = gamesWithBlunderData.length > 0
    ? gamesWithBlunderData.reduce((sum, g) => sum + g.blunders, 0) / gamesWithBlunderData.length
    : 0
  
  console.log(`📊 Blunder data: ${gamesWithBlunderData.length}/${totalGames} games have blunder data`)
  
  // Calculate rates only from decisive games (exclude unknown results)
  const decisiveGames = wins + draws + losses
  const overall = {
    winRate: decisiveGames > 0 ? wins / decisiveGames : 0,
    drawRate: decisiveGames > 0 ? draws / decisiveGames : 0,
    lossRate: decisiveGames > 0 ? losses / decisiveGames : 0,
    avgAccuracy,
    avgBlunders,
    // Add data coverage metrics
    gamesWithAccuracy: gamesWithAccuracy.length,
    gamesWithBlunderData: gamesWithBlunderData.length,
    unknownResults: unknown
  }
  
  // Trend analysis
  const trends = computeTrends(games)
  
  // Opening analysis
  const openings = computeOpeningAnalysis(games)
  
  // Phase performance (if we have move data)
  const phases = computePhasePerformance(games)
  
  // Time-based metrics
  const gamesPerWeek = totalGames / (period.days / 7)
  const peakPerformancePeriod = findPeakPerformancePeriod(games)
  
  // Neutral signals (facts only, no interpretation)
  const signals = generateSignals(trends)
  
  return {
    id: summaryId,
    computedAt: now.toISOString(),
    gameCountUsed: totalGames,
    totalGames,
    period,
    overall,
    trends,
    openings,
    phases,
    gamesPerWeek,
    peakPerformancePeriod,
    signals
  }
}

/**
 * Compute trend analysis comparing recent vs historical performance
 */
function computeTrends(games: ProcessedGame[]): {
  accuracy: TrendDirection
  blunders: TrendDirection
  winRate: TrendDirection
} {
  if (games.length < 20) {
    return {
      accuracy: { direction: 'insufficient_data' },
      blunders: { direction: 'insufficient_data' },
      winRate: { direction: 'insufficient_data' }
    }
  }
  
  // Compare last 50 games vs previous 50 games
  const recentCount = Math.min(50, Math.floor(games.length / 2))
  const recentGames = games.slice(-recentCount)
  const previousGames = games.slice(-recentCount * 2, -recentCount)
  
  // Accuracy trend
  let accuracy: TrendDirection = { direction: 'insufficient_data' }
  const recentWithAccuracy = recentGames.filter(g => g.hasAccuracy)
  const previousWithAccuracy = previousGames.filter(g => g.hasAccuracy)
  
  if (recentWithAccuracy.length > 0 && previousWithAccuracy.length > 0) {
    const recentAvg = recentWithAccuracy.reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / recentWithAccuracy.length
    const previousAvg = previousWithAccuracy.reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / previousWithAccuracy.length
    const delta = recentAvg - previousAvg
    
    accuracy = {
      direction: delta > 2 ? 'improving' : delta < -2 ? 'declining' : 'stable',
      deltaLast50: delta
    }
  }
  
  // Blunder trend
  const recentBlunders = recentGames.reduce((sum, g) => sum + g.blunders, 0) / recentGames.length
  const previousBlunders = previousGames.length > 0 
    ? previousGames.reduce((sum, g) => sum + g.blunders, 0) / previousGames.length 
    : recentBlunders
  
  const blunderDelta = recentBlunders - previousBlunders
  const blunders: TrendDirection = {
    direction: blunderDelta < -0.2 ? 'improving' : blunderDelta > 0.2 ? 'declining' : 'stable',
    deltaLast50: -blunderDelta // Negative because fewer blunders = improvement
  }
  
  // Win rate trend
  const recentWins = recentGames.filter(g => g.isWin).length / recentGames.length
  const previousWins = previousGames.length > 0 
    ? previousGames.filter(g => g.isWin).length / previousGames.length 
    : recentWins
  
  const winRateDelta = recentWins - previousWins
  const winRate: TrendDirection = {
    direction: winRateDelta > 0.05 ? 'improving' : winRateDelta < -0.05 ? 'declining' : 'stable',
    deltaLast50: winRateDelta
  }
  
  return { accuracy, blunders, winRate }
}

/**
 * Analyze opening performance
 */
function computeOpeningAnalysis(games: ProcessedGame[]): {
  strongest: OpeningStats[]
  weakest: OpeningStats[]
  mostPlayed: OpeningStats[]
} {
  const openingStats = new Map<string, {
    games: number
    wins: number
    totalAccuracy: number
    accuracyCount: number
    totalBlunders: number
  }>()
  
  // Accumulate stats per opening
  games.forEach(game => {
    const opening = game.opening_name || 'Unknown Opening'
    
    if (!openingStats.has(opening)) {
      openingStats.set(opening, {
        games: 0,
        wins: 0,
        totalAccuracy: 0,
        accuracyCount: 0,
        totalBlunders: 0
      })
    }
    
    const stats = openingStats.get(opening)!
    stats.games++
    if (game.isWin) stats.wins++
    if (game.hasAccuracy) {
      stats.totalAccuracy += game.my_accuracy || 0
      stats.accuracyCount++
    }
    stats.totalBlunders += game.blunders
  })
  
  // Convert to OpeningStats array
  const openings: OpeningStats[] = Array.from(openingStats.entries())
    .filter(([_, stats]) => stats.games >= 3) // Minimum 3 games
    .map(([opening, stats]) => ({
      opening,
      games: stats.games,
      winRate: stats.wins / stats.games,
      avgAccuracy: stats.accuracyCount > 0 ? stats.totalAccuracy / stats.accuracyCount : undefined,
      avgBlunders: stats.totalBlunders / stats.games
    }))
  
  // Sort and get top/bottom 5
  const byWinRate = [...openings].sort((a, b) => b.winRate - a.winRate)
  const byFrequency = [...openings].sort((a, b) => b.games - a.games)
  
  return {
    strongest: byWinRate.slice(0, 5),
    weakest: byWinRate.slice(-5).reverse(),
    mostPlayed: byFrequency.slice(0, 5)
  }
}

/**
 * Analyze performance by game phase (if data available)
 */
function computePhasePerformance(games: ProcessedGame[]): PhasePerformance | undefined {
  // This is a simplified implementation
  // In a real system, you'd analyze move-by-move data
  
  const gamesWithAccuracy = games.filter(g => g.hasAccuracy)
  if (gamesWithAccuracy.length === 0) {
    return undefined
  }
  
  // Rough heuristics based on game length and blunder distribution
  const shortGames = games.filter(g => g.moveCount < 20) // Opening phase issues
  const mediumGames = games.filter(g => g.moveCount >= 20 && g.moveCount < 40)
  const longGames = games.filter(g => g.moveCount >= 40) // Endgame reached
  
  return {
    opening: {
      avgAccuracy: shortGames.filter(g => g.hasAccuracy).length > 0 
        ? shortGames.filter(g => g.hasAccuracy).reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / shortGames.filter(g => g.hasAccuracy).length
        : undefined,
      avgBlunders: shortGames.length > 0 ? shortGames.reduce((sum, g) => sum + g.blunders, 0) / shortGames.length : 0
    },
    middlegame: {
      avgAccuracy: mediumGames.filter(g => g.hasAccuracy).length > 0 
        ? mediumGames.filter(g => g.hasAccuracy).reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / mediumGames.filter(g => g.hasAccuracy).length
        : undefined,
      avgBlunders: mediumGames.length > 0 ? mediumGames.reduce((sum, g) => sum + g.blunders, 0) / mediumGames.length : 0
    },
    endgame: {
      avgAccuracy: longGames.filter(g => g.hasAccuracy).length > 0 
        ? longGames.filter(g => g.hasAccuracy).reduce((sum, g) => sum + (g.my_accuracy || 0), 0) / longGames.filter(g => g.hasAccuracy).length
        : undefined,
      avgBlunders: longGames.length > 0 ? longGames.reduce((sum, g) => sum + g.blunders, 0) / longGames.length : 0
    }
  }
}

/**
 * Find peak performance period
 */
function findPeakPerformancePeriod(games: ProcessedGame[]): ProgressionSummary['peakPerformancePeriod'] {
  if (games.length < 20) return undefined
  
  // Find best 20-game streak by win rate
  let bestWinRate = 0
  let bestStart = 0
  let bestEnd = 19
  
  for (let i = 0; i <= games.length - 20; i++) {
    const streak = games.slice(i, i + 20)
    const winRate = streak.filter(g => g.isWin).length / 20
    
    if (winRate > bestWinRate) {
      bestWinRate = winRate
      bestStart = i
      bestEnd = i + 19
    }
  }
  
  if (bestWinRate === 0) return undefined
  
  return {
    start: games[bestStart].gameDate.toISOString().split('T')[0],
    end: games[bestEnd].gameDate.toISOString().split('T')[0],
    winRate: bestWinRate,
    gameCount: 20
  }
}

/**
 * Generate neutral signals (facts only, no interpretation)
 */
function generateSignals(
  trends: ProgressionSummary['trends']
): ProgressionSummary['signals'] {
  return {
    accuracyTrend: trends.accuracy.direction,
    blunderTrend: trends.blunders.direction,
    winRateTrend: trends.winRate.direction,
    accuracyDeltaLast100: trends.accuracy.deltaLast50 ? trends.accuracy.deltaLast50 * 2 : undefined,
    blunderDeltaLast100: trends.blunders.deltaLast50 ? trends.blunders.deltaLast50 * 2 : undefined,
    winRateDeltaLast100: trends.winRate.deltaLast50 ? trends.winRate.deltaLast50 * 2 : undefined
  }
}

/**
 * Create empty summary for when no games exist
 */
function createEmptySummary(): ProgressionSummary {
  const now = new Date()
  
  return {
    id: `empty-${now.getTime()}`,
    computedAt: now.toISOString(),
    gameCountUsed: 0,
    totalGames: 0,
    period: {
      start: now.toISOString().split('T')[0],
      end: now.toISOString().split('T')[0],
      days: 0
    },
    overall: {
      winRate: 0,
      drawRate: 0,
      lossRate: 0,
      avgBlunders: 0,
      gamesWithAccuracy: 0,
      gamesWithBlunderData: 0,
      unknownResults: 0
    },
    trends: {
      accuracy: { direction: 'insufficient_data' },
      blunders: { direction: 'insufficient_data' },
      winRate: { direction: 'insufficient_data' }
    },
    openings: {
      strongest: [],
      weakest: [],
      mostPlayed: []
    },
    gamesPerWeek: 0,
    signals: {
      accuracyTrend: 'insufficient_data',
      blunderTrend: 'insufficient_data',
      winRateTrend: 'insufficient_data'
    }
  }
}