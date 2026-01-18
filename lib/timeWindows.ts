import { TimeWindow, TIME_WINDOWS, TimeWindowPreset } from '@/types/ProgressionSummary'

/**
 * Generate a time window for the last N days from a given date
 */
export function getLastNDaysWindow(n: number, now: Date = new Date()): TimeWindow {
  const end = new Date(now)
  const start = new Date(now)
  start.setDate(start.getDate() - n)
  
  // Format as YYYY-MM-DD
  const startStr = start.toISOString().split('T')[0]
  const endStr = end.toISOString().split('T')[0]
  
  let label: string
  if (n === 1) {
    label = 'Today'
  } else if (n === 7) {
    label = 'Last 7 days'
  } else if (n === 30) {
    label = 'Last 30 days'
  } else if (n === 90) {
    label = 'Last 90 days'
  } else if (n === 180) {
    label = 'Last 6 months'
  } else if (n === 365) {
    label = 'Last year'
  } else {
    label = `Last ${n} days`
  }
  
  return {
    start: startStr,
    end: endStr,
    label,
    gameCount: 0 // Will be filled by caller
  }
}

/**
 * Generate a time window using preset constants
 */
export function getPresetWindow(preset: TimeWindowPreset, now: Date = new Date()): TimeWindow {
  const days = TIME_WINDOWS[preset]
  return getLastNDaysWindow(days, now)
}

/**
 * Generate a custom date range window
 */
export function getCustomWindow(startDate: string, endDate: string, label?: string): TimeWindow {
  const start = new Date(startDate)
  const end = new Date(endDate)
  
  if (start > end) {
    throw new Error('Start date must be before end date')
  }
  
  const defaultLabel = `${startDate} to ${endDate}`
  
  return {
    start: startDate,
    end: endDate,
    label: label || defaultLabel,
    gameCount: 0 // Will be filled by caller
  }
}

/**
 * Generate multiple common time windows
 */
export function getCommonTimeWindows(now: Date = new Date()): TimeWindow[] {
  return [
    getPresetWindow('LAST_7_DAYS', now),
    getPresetWindow('LAST_30_DAYS', now),
    getPresetWindow('LAST_90_DAYS', now),
    getPresetWindow('LAST_6_MONTHS', now),
    getPresetWindow('LAST_YEAR', now)
  ]
}

/**
 * Check if a date string falls within a time window
 */
export function isDateInWindow(dateStr: string, window: TimeWindow): boolean {
  const date = new Date(dateStr)
  const start = new Date(window.start)
  const end = new Date(window.end)
  
  // Include start date, exclude end date (end is "up to but not including")
  return date >= start && date < end
}

/**
 * Count games that fall within a time window
 */
export function countGamesInWindow(games: Array<{ date?: string; created_at?: Date }>, window: TimeWindow): number {
  return games.filter(game => {
    const gameDate = game.date || (game.created_at ? game.created_at.toISOString().split('T')[0] : null)
    return gameDate && isDateInWindow(gameDate, window)
  }).length
}

/**
 * Filter games to only those within a time window
 */
export function filterGamesInWindow<T extends { date?: string; created_at?: Date }>(
  games: T[], 
  window: TimeWindow
): T[] {
  return games.filter(game => {
    const gameDate = game.date || (game.created_at ? game.created_at.toISOString().split('T')[0] : null)
    return gameDate && isDateInWindow(gameDate, window)
  })
}

/**
 * Parse natural language time expressions into time windows
 */
export function parseTimeExpression(expression: string, now: Date = new Date()): TimeWindow | null {
  const expr = expression.toLowerCase().trim()
  
  // Match "last X days/weeks/months"
  const lastMatch = expr.match(/last (\d+) (days?|weeks?|months?)/)
  if (lastMatch) {
    const num = parseInt(lastMatch[1])
    const unit = lastMatch[2]
    
    let days: number
    if (unit.startsWith('day')) {
      days = num
    } else if (unit.startsWith('week')) {
      days = num * 7
    } else if (unit.startsWith('month')) {
      days = num * 30 // Approximate
    } else {
      return null
    }
    
    return getLastNDaysWindow(days, now)
  }
  
  // Match preset expressions
  switch (expr) {
    case 'today':
      return getLastNDaysWindow(1, now)
    case 'yesterday':
      const yesterday = new Date(now)
      yesterday.setDate(yesterday.getDate() - 1)
      return getCustomWindow(
        yesterday.toISOString().split('T')[0],
        now.toISOString().split('T')[0],
        'Yesterday'
      )
    case 'this week':
    case 'last week':
      return getLastNDaysWindow(7, now)
    case 'this month':
    case 'last month':
      return getLastNDaysWindow(30, now)
    case 'last 3 months':
      return getLastNDaysWindow(90, now)
    case 'last 6 months':
      return getLastNDaysWindow(180, now)
    case 'this year':
    case 'last year':
      return getLastNDaysWindow(365, now)
    default:
      return null
  }
}

/**
 * Format a time window for display in prompts
 */
export function formatTimeWindowForPrompt(window: TimeWindow): string {
  const lines = [
    `=== TIME WINDOW ===`,
    `${window.label} (${window.start} → ${window.end})`,
    `Games in period: ${window.gameCount}`,
    `===================`
  ]
  
  return lines.join('\n')
}