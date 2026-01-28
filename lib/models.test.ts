import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getGameSummariesByDateRange } from './models'

// Mock the database module
const mockSql = vi.fn()
vi.mock('@/lib/database', () => ({
  getSql: () => mockSql
}))

describe('getGameSummariesByDateRange', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('filters games by date range using optimized SQL query', async () => {
    // The optimization moves filtering to SQL.
    // We simulate the DB returning the filtered rows.
    const filteredMockRows = [
      { id: 1, date: '2023-01-01', created_at: new Date('2023-01-01T10:00:00Z') }, // In range
      { id: 2, date: '2023.01.02', created_at: new Date('2023-01-02T10:00:00Z') }, // In range, dot format
      { id: 5, date: null, created_at: new Date('2023-01-03T10:00:00Z') }, // Fallback to created_at (in range)
    ]

    mockSql.mockResolvedValue(filteredMockRows)

    const startDate = '2023-01-01'
    const endDate = '2023-01-31'
    const limit = 50

    const result = await getGameSummariesByDateRange(startDate, endDate, limit)

    // Inspect generated SQL
    const callArgs = mockSql.mock.calls[0]
    const queryParts = callArgs[0] as TemplateStringsArray
    const values = callArgs.slice(1)

    const queryText = queryParts.join('?')
    console.log('Generated SQL:', queryText)
    console.log('Values:', values)

    // Verify SQL structure
    expect(queryText).toContain("REPLACE(date, '.', '-')::date")
    expect(queryText).toContain("created_at::date")

    // Verify values passed to query
    // Values order: start, end, start, end, limit
    expect(values[0]).toBe('2023-01-01') // start
    expect(values[1]).toBe('2023-01-31') // end
    expect(values[2]).toBe('2023-01-01') // start
    expect(values[3]).toBe('2023-01-31') // end
    expect(values[4]).toBe(50)           // limit

    // Verify results match what DB returned (passthrough)
    expect(result).toHaveLength(3)
    expect(result.map(r => r.id)).toEqual(expect.arrayContaining(['1', '2', '5']))
  })
})
