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
  if (!dateStr) return false
  
  // Normalize date string - handle Chess.com format (YYYY.MM.DD) and other formats
  let normalizedDate = dateStr.trim()
  
  // Convert Chess.com format (YYYY.MM.DD) to ISO format (YYYY-MM-DD)
  if (normalizedDate.includes('.')) {
    normalizedDate = normalizedDate.replace(/\./g, '-')
  }
  
  // Extract just the date part (YYYY-MM-DD) if there's time info
  const dateOnly = normalizedDate.split('T')[0].split(' ')[0]
  
  // Parse the date
  const date = new Date(dateOnly + 'T00:00:00Z')
  if (isNaN(date.getTime())) {
    return false
  }
  
  const start = new Date(window.start + 'T00:00:00Z')
  // End is exclusive: [start, end)
  const end = new Date(window.end + 'T00:00:00Z')
  
  // Include start date, exclude end date.
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
  // Normalize spelled-out numbers to digits
  const normalizeExpr = (expr: string) => {
    return expr
      .replace(/\bsix\b/gi, '6')
      .replace(/\bthree\b/gi, '3')
      .replace(/\bone\b/gi, '1')
      .replace(/\btwo\b/gi, '2')
      .replace(/\bfour\b/gi, '4')
      .replace(/\bfive\b/gi, '5')
      .replace(/\bseven\b/gi, '7')
      .replace(/\beight\b/gi, '8')
      .replace(/\bnine\b/gi, '9')
      .replace(/\bten\b/gi, '10')
  }
  
  const expr = normalizeExpr(expression.toLowerCase().trim())

  const toIsoDate = (d: Date): string => d.toISOString().split('T')[0]

  const parseDateLoose = (raw: string): string | null => {
    const token = raw.trim()
    if (!token) return null

    // Numeric formats: YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD
    const m = token.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/)
    if (m) {
      const yyyy = Number(m[1])
      const mm = Number(m[2])
      const dd = Number(m[3])
      if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
        const d = new Date(Date.UTC(yyyy, mm - 1, dd))
        if (!isNaN(d.getTime())) return toIsoDate(d)
      }
    }

    // Month-name formats (best-effort): "jan 5", "january 5 2026", "5 jan 2026"
    const hasYear = /\b\d{4}\b/.test(token)
    const candidate = hasYear ? token : `${token} ${now.getFullYear()}`
    const d = new Date(candidate)
    if (!isNaN(d.getTime())) {
      // If the user omitted year and the parsed date lands in the future, assume previous year.
      if (!hasYear && d.getTime() > now.getTime()) {
        const prev = new Date(d)
        prev.setFullYear(prev.getFullYear() - 1)
        return toIsoDate(prev)
      }
      return toIsoDate(d)
    }

    return null
  }

  // Explicit date ranges:
  // - "2025-11-01 to 2026-01-15"
  // - "from 2025-11-01 to 2026-01-15"
  // - "between 2025-11-01 and 2026-01-15"
  const numericRange = expr.match(
    /(\d{4}[./-]\d{1,2}[./-]\d{1,2})\s*(?:to|-|–|—|and)\s*(\d{4}[./-]\d{1,2}[./-]\d{1,2})/
  )
  if (numericRange) {
    const start = parseDateLoose(numericRange[1])
    const end = parseDateLoose(numericRange[2])
    if (start && end) return getCustomWindow(start, end, `${start} to ${end}`)
  }

  const fromTo = expr.match(/\bfrom\s+([^,;]+?)\s+to\s+([^,;]+)\b/)
  if (fromTo) {
    const start = parseDateLoose(fromTo[1])
    const end = parseDateLoose(fromTo[2])
    if (start && end) return getCustomWindow(start, end, `${start} to ${end}`)
  }

  const betweenAnd = expr.match(/\bbetween\s+([^,;]+?)\s+and\s+([^,;]+)\b/)
  if (betweenAnd) {
    const start = parseDateLoose(betweenAnd[1])
    const end = parseDateLoose(betweenAnd[2])
    if (start && end) return getCustomWindow(start, end, `${start} to ${end}`)
  }

  // "since <date>"
  const since = expr.match(/\bsince\s+([^,;]+)\b/)
  if (since) {
    const start = parseDateLoose(since[1])
    if (start) return getCustomWindow(start, toIsoDate(now), `Since ${start}`)
  }
  
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

  // Also accept common synonyms: "past", "previous", "over the last", "in the last"
  const relativeMatch = expr.match(/\b(?:past|previous|over the last|in the last)\s+(\d+)\s+(days?|weeks?|months?)\b/)
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1])
    const unit = relativeMatch[2]
    let days: number
    if (unit.startsWith('day')) days = num
    else if (unit.startsWith('week')) days = num * 7
    else if (unit.startsWith('month')) days = num * 30
    else return null
    return getLastNDaysWindow(days, now)
  }
  
  // Match common preset phrases inside longer sentences.
  // Example: "how was my last week" -> matches "last week".
  const has = (re: RegExp) => re.test(expr)

  if (has(/\btoday\b/)) return getLastNDaysWindow(1, now)

  if (has(/\byesterday\b/)) {
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    return getCustomWindow(
      yesterday.toISOString().split('T')[0],
      now.toISOString().split('T')[0],
      'Yesterday'
    )
  }

  if (has(/\b(last|this)\s+week\b/)) return getLastNDaysWindow(7, now)
  if (has(/\b(last|this)\s+month\b/)) return getLastNDaysWindow(30, now)
  if (has(/\b(last|this)\s+year\b/)) return getLastNDaysWindow(365, now)
  if (has(/\b(last|previous|past)\s+fortnight\b/)) return getLastNDaysWindow(14, now)
  if (has(/\b(last|previous|past)\s+quarter\b/)) return getLastNDaysWindow(90, now)

  // If the caller passed exactly the short phrase, keep supporting it as well.
  // (This also covers "last three months"/"last six months" after normalization.)
  switch (expr) {
    case 'this week':
    case 'last week':
      return getLastNDaysWindow(7, now)
    case 'this month':
    case 'last month':
      return getLastNDaysWindow(30, now)
    case 'last 3 months':
    case 'last three months':
      return getLastNDaysWindow(90, now)
    case 'last 6 months':
    case 'last six months':
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