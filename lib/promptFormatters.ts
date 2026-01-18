import { ProgressionSummary } from '@/types/ProgressionSummary'
import { EngineSummary } from '@/types/EngineSummary'

/**
 * Format progression summary for LLM prompt
 * This is the ONLY way progression data should be presented to the LLM
 */
export function formatProgressionSummaryForPrompt(summary: ProgressionSummary): string {
  const lines = [
    '=== PLAYER CAREER SUMMARY (AUTHORITATIVE) ===',
    '=== DEBUG: PROGRESSION SUMMARY PRESENT ===',
    `TotalGames: ${summary.totalGames.toLocaleString()}`,
    `StartDate: ${summary.period.start}`,
    `EndDate: ${summary.period.end}`,
    '=== END DEBUG MARKER ===',
    '',
    'This data comes from precomputed batch analysis of all games in the database.',
    'These are the EXACT totals, dates, and trends. Use these numbers when answering questions about overall progression.',
    'CRITICAL: When asked "How many games have you analyzed?" or "What is my progression?", you MUST use the numbers below.',
    'You MUST NOT say "I do not have access" - the data is provided below.',
    '',
    `Total games analyzed: ${summary.totalGames.toLocaleString()}`,
    `Period: ${summary.period.start} → ${summary.period.end} (${summary.period.days} days)`,
    `Games per week: ${summary.gamesPerWeek.toFixed(1)}`,
    '',
    '--- OVERALL PERFORMANCE ---',
    `Win rate: ${(summary.overall.winRate * 100).toFixed(1)}%`,
    `Draw rate: ${(summary.overall.drawRate * 100).toFixed(1)}%`,
    `Loss rate: ${(summary.overall.lossRate * 100).toFixed(1)}%`,
  ]

  if (summary.overall.avgAccuracy !== undefined) {
    lines.push(`Average accuracy: ${summary.overall.avgAccuracy.toFixed(1)}% (${summary.overall.gamesWithAccuracy} games with data)`)
  } else {
    lines.push(`Average accuracy: No data available`)
  }
  lines.push(`Average blunders per game: ${summary.overall.avgBlunders.toFixed(2)} (${summary.overall.gamesWithBlunderData} games with data)`)
  
  // Data coverage information
  if (summary.overall.unknownResults > 0) {
    lines.push(`Unknown/unfinished results: ${summary.overall.unknownResults} games`)
  }

  // Trends
  lines.push('', '--- RECENT TRENDS ---')
  
  if (summary.trends.accuracy.direction !== 'insufficient_data') {
    const trendIcon = getTrendIcon(summary.trends.accuracy.direction)
    const deltaText = summary.trends.accuracy.deltaLast50 
      ? ` (${summary.trends.accuracy.deltaLast50 > 0 ? '+' : ''}${summary.trends.accuracy.deltaLast50.toFixed(1)}% vs previous period)`
      : ''
    lines.push(`Accuracy trend: ${trendIcon} ${summary.trends.accuracy.direction}${deltaText}`)
  }
  
  if (summary.trends.blunders.direction !== 'insufficient_data') {
    const trendIcon = getTrendIcon(summary.trends.blunders.direction)
    lines.push(`Blunder trend: ${trendIcon} ${summary.trends.blunders.direction}`)
  }
  
  if (summary.trends.winRate.direction !== 'insufficient_data') {
    const trendIcon = getTrendIcon(summary.trends.winRate.direction)
    lines.push(`Win rate trend: ${trendIcon} ${summary.trends.winRate.direction}`)
  }

  // Openings
  if (summary.openings.strongest.length > 0) {
    lines.push('', '--- TOP OPENINGS ---')
    summary.openings.strongest.slice(0, 3).forEach(opening => {
      lines.push(`${opening.opening}: ${(opening.winRate * 100).toFixed(0)}% win rate (${opening.games} games)`)
    })
  }

  if (summary.openings.weakest.length > 0) {
    lines.push('', '--- AREAS FOR IMPROVEMENT ---')
    summary.openings.weakest.slice(0, 2).forEach(opening => {
      lines.push(`${opening.opening}: ${(opening.winRate * 100).toFixed(0)}% win rate (${opening.games} games)`)
    })
  }

  // Peak performance
  if (summary.peakPerformancePeriod) {
    lines.push('', '--- PEAK PERFORMANCE ---')
    lines.push(`Best ${summary.peakPerformancePeriod.gameCount}-game streak: ${(summary.peakPerformancePeriod.winRate * 100).toFixed(1)}% win rate`)
    lines.push(`Period: ${summary.peakPerformancePeriod.start} to ${summary.peakPerformancePeriod.end}`)
  }

  // Signals (neutral facts only)
  if (summary.signals.accuracyTrend !== 'insufficient_data' || 
      summary.signals.blunderTrend !== 'insufficient_data' || 
      summary.signals.winRateTrend !== 'insufficient_data') {
    lines.push('', '--- PERFORMANCE SIGNALS ---')
    if (summary.signals.accuracyDeltaLast100 !== undefined) {
      lines.push(`Accuracy change (last 100 games): ${summary.signals.accuracyDeltaLast100 > 0 ? '+' : ''}${summary.signals.accuracyDeltaLast100.toFixed(1)}%`)
    }
    if (summary.signals.blunderDeltaLast100 !== undefined) {
      lines.push(`Blunder rate change (last 100 games): ${summary.signals.blunderDeltaLast100 > 0 ? '+' : ''}${summary.signals.blunderDeltaLast100.toFixed(2)} per game`)
    }
    if (summary.signals.winRateDeltaLast100 !== undefined) {
      lines.push(`Win rate change (last 100 games): ${summary.signals.winRateDeltaLast100 > 0 ? '+' : ''}${(summary.signals.winRateDeltaLast100 * 100).toFixed(1)}%`)
    }
  }

  lines.push('', `Analysis computed: ${new Date(summary.computedAt).toLocaleString()}`)
  lines.push('When asked about total games, progression, or career-wide statistics, use the numbers above.')
  lines.push('Distinguish clearly between single-game analysis (if a specific game is selected) and career-wide analysis (use the summary above).')
  lines.push('=============================================')

  return lines.join('\n')
}

/**
 * Format engine summary for LLM prompt
 * This is the ONLY way engine-derived data should be presented to the LLM
 * Facts only - no narration, no interpretation
 */
export function formatEngineSummaryForPrompt(summary: EngineSummary): string {
  const lines = [
    '=== ENGINE ANALYSIS SUMMARY (AUTHORITATIVE) ===',
    '=== DEBUG: ENGINE SUMMARY PRESENT ===',
    `CoveragePercent: ${summary.coveragePercent.toFixed(1)}%`,
    `GamesWithEngineAnalysis: ${summary.gamesWithEngineAnalysis.toLocaleString()}`,
    `TotalGames: ${summary.totalGames.toLocaleString()}`,
    '=== END DEBUG MARKER ===',
    '',
    'This data comes from precomputed batch analysis of engine-derived metrics.',
    'These are the EXACT engine metrics computed by Stockfish analysis.',
    'CRITICAL: When asked about engine analysis, CPL, blunders, or engine trends, you MUST use the numbers below.',
    'You MUST NOT say "I do not have access" or "I don\'t have engine data" if this section is present.',
    '',
    `Engine analysis coverage: ${summary.gamesWithEngineAnalysis.toLocaleString()}/${summary.totalGames.toLocaleString()} games (${summary.coveragePercent.toFixed(1)}%)`,
    `Engine: ${summary.engineInfo.engineName}${summary.engineInfo.engineVersion ? ` ${summary.engineInfo.engineVersion}` : ''} (depth ${summary.engineInfo.analysisDepth})`,
    '',
    '--- OVERALL ENGINE METRICS ---',
  ]
  
  if (summary.overall.avgCentipawnLoss !== null) {
    lines.push(`Average centipawn loss: ${summary.overall.avgCentipawnLoss.toFixed(1)}`)
  } else {
    lines.push(`Average centipawn loss: No data available`)
  }
  
  lines.push(`Blunder rate: ${summary.overall.blunderRate.toFixed(2)} per game`)
  lines.push(`Mistake rate: ${summary.overall.mistakeRate.toFixed(2)} per game`)
  lines.push(`Inaccuracy rate: ${summary.overall.inaccuracyRate.toFixed(2)} per game`)
  
  if (summary.overall.avgEvalSwingMax !== null) {
    lines.push(`Average max evaluation swing: ${summary.overall.avgEvalSwingMax.toFixed(1)}`)
  }
  
  // Phase-specific metrics
  lines.push('', '--- PHASE-SPECIFIC METRICS ---')
  
  if (summary.byPhase.opening.avgCpl !== null) {
    lines.push(`Opening CPL: ${summary.byPhase.opening.avgCpl.toFixed(1)} (${summary.byPhase.opening.gamesInPhase} games, ${summary.byPhase.opening.blunderRate.toFixed(2)} blunders/game)`)
  } else {
    lines.push(`Opening CPL: No data available`)
  }
  
  if (summary.byPhase.middlegame.avgCpl !== null) {
    lines.push(`Middlegame CPL: ${summary.byPhase.middlegame.avgCpl.toFixed(1)} (${summary.byPhase.middlegame.gamesInPhase} games, ${summary.byPhase.middlegame.blunderRate.toFixed(2)} blunders/game)`)
  } else {
    lines.push(`Middlegame CPL: No data available`)
  }
  
  if (summary.byPhase.endgame.avgCpl !== null) {
    lines.push(`Endgame CPL: ${summary.byPhase.endgame.avgCpl.toFixed(1)} (${summary.byPhase.endgame.gamesInPhase} games, ${summary.byPhase.endgame.blunderRate.toFixed(2)} blunders/game)`)
  } else {
    lines.push(`Endgame CPL: No data available`)
  }
  
  // Trends
  if (summary.trends.cplDelta !== null || summary.trends.blunderRateDelta !== 0) {
    lines.push('', '--- ENGINE TRENDS (LAST 50 VS PREVIOUS 50) ---')
    
    if (summary.trends.cplDelta !== null) {
      const trendIcon = summary.trends.cplDelta < 0 ? '📈' : summary.trends.cplDelta > 0 ? '📉' : '➡️'
      lines.push(`CPL trend: ${trendIcon} ${summary.trends.cplDelta > 0 ? '+' : ''}${summary.trends.cplDelta.toFixed(1)} (recent: ${summary.trends.recent50.avgCpl?.toFixed(1) || 'N/A'}, previous: ${summary.trends.previous50.avgCpl?.toFixed(1) || 'N/A'})`)
    }
    
    const blunderTrendIcon = summary.trends.blunderRateDelta < 0 ? '📈' : summary.trends.blunderRateDelta > 0 ? '📉' : '➡️'
    lines.push(`Blunder rate trend: ${blunderTrendIcon} ${summary.trends.blunderRateDelta > 0 ? '+' : ''}${summary.trends.blunderRateDelta.toFixed(2)} per game (recent: ${summary.trends.recent50.blunderRate.toFixed(2)}, previous: ${summary.trends.previous50.blunderRate.toFixed(2)})`)
  }
  
  lines.push('', `Analysis computed: ${new Date(summary.computedAt).toLocaleString()}`)
  lines.push('When asked about engine analysis, centipawn loss, blunders, or engine trends, use the numbers above.')
  lines.push('If coveragePercent is 0, explicitly state that engine analysis data is unavailable.')
  lines.push('=============================================')
  
  return lines.join('\n')
}

function getTrendIcon(direction: string): string {
  switch (direction) {
    case 'improving': return '📈'
    case 'declining': return '📉'
    case 'stable': return '➡️'
    default: return '❓'
  }
}