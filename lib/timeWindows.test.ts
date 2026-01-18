import {
  countGamesInWindow,
  filterGamesInWindow,
  formatTimeWindowForPrompt,
  getCommonTimeWindows,
  getCustomWindow,
  getLastNDaysWindow,
  getPresetWindow,
  isDateInWindow,
  parseTimeExpression,
} from '@/lib/timeWindows'

function ymd(date: Date): string {
  return date.toISOString().split('T')[0]
}

describe('lib/timeWindows', () => {
  it('getLastNDaysWindow generates expected start/end/label', () => {
    const now = new Date()
    const window = getLastNDaysWindow(7, now)

    const expectedEnd = ymd(now)
    const expectedStartDate = new Date(now)
    expectedStartDate.setDate(expectedStartDate.getDate() - 7)
    const expectedStart = ymd(expectedStartDate)

    expect(window).toEqual({
      start: expectedStart,
      end: expectedEnd,
      label: 'Last 7 days',
      gameCount: 0,
    })
  })

  it('getPresetWindow uses TIME_WINDOWS presets', () => {
    const now = new Date()
    const window = getPresetWindow('LAST_30_DAYS', now)
    expect(window.label).toBe('Last 30 days')
  })

  it('getCustomWindow throws when start > end', () => {
    expect(() => getCustomWindow('2026-02-01', '2026-01-01')).toThrow(
      'Start date must be before end date'
    )
  })

  it('isDateInWindow includes start and excludes end', () => {
    const window = getCustomWindow('2026-01-01', '2026-01-02', 'One day')
    expect(isDateInWindow('2026-01-01', window)).toBe(true)
    expect(isDateInWindow('2026-01-02', window)).toBe(false)
  })

  it('countGamesInWindow and filterGamesInWindow handle date and created_at', () => {
    const window = getCustomWindow('2026-01-01', '2026-01-10', 'Range')
    const games = [
      { date: '2026-01-01' }, // in
      { date: '2026-01-09' }, // in
      { date: '2026-01-10' }, // out (end exclusive)
      { created_at: new Date('2026-01-05T12:00:00Z') }, // in
      { created_at: new Date('2025-12-31T12:00:00Z') }, // out
    ]

    expect(countGamesInWindow(games, window)).toBe(3)
    expect(filterGamesInWindow(games, window)).toHaveLength(3)
  })

  it('parseTimeExpression supports "last N days/weeks/months" and common presets', () => {
    const now = new Date()
    const last2Weeks = parseTimeExpression('last 2 weeks', now)
    expect(last2Weeks?.label).toBe('Last 14 days')

    const today = parseTimeExpression('today', now)
    expect(today?.label).toBe('Today')

    const yesterday = parseTimeExpression('yesterday', now)
    expect(yesterday?.label).toBe('Yesterday')

    const last6Months = parseTimeExpression('last 6 months', now)
    expect(last6Months?.label).toBe('Last 6 months')

    expect(parseTimeExpression('nonsense', now)).toBeNull()
  })

  it('getCommonTimeWindows returns common presets in order', () => {
    const windows = getCommonTimeWindows(new Date())
    expect(windows.map((w) => w.label)).toEqual([
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
      'Last 6 months',
      'Last year',
    ])
  })

  it('formatTimeWindowForPrompt renders stable prompt block', () => {
    const window = { start: '2026-01-01', end: '2026-02-01', label: 'Jan', gameCount: 42 }
    const out = formatTimeWindowForPrompt(window)
    expect(out).toContain('=== TIME WINDOW ===')
    expect(out).toContain('Jan (2026-01-01 → 2026-02-01)')
    expect(out).toContain('Games in period: 42')
  })
})

