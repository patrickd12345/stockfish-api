import { vi, describe, it, expect, beforeEach } from 'vitest'
import { computeEngineSummary } from './engineSummaryAnalysis'

// Mock database module
const mockSql = vi.fn()
vi.mock('@/lib/database', () => ({
  connectToDb: vi.fn(),
  getSql: () => mockSql
}))

vi.mock('@/lib/engineSummaryStorage', () => ({
  storeEngineSummary: vi.fn()
}))

describe('computeEngineSummary', () => {
  beforeEach(() => {
    mockSql.mockReset()
  })

  it('computes summary correctly with aggregation optimization', async () => {
    // Setup mocks
    // Call 1: Total games query
    mockSql.mockResolvedValueOnce([{ count: 100 }])

    // Call 2: Aggregates query
    mockSql.mockResolvedValueOnce([{
      games_with_analysis: 50,
      avg_centipawn_loss: 25.5,
      total_blunders: 10,
      total_mistakes: 20,
      total_inaccuracies: 30,
      avg_eval_swing_max: 1.5,
      opening_avg_cpl: 10,
      middlegame_avg_cpl: 20,
      endgame_avg_cpl: 30,
      opening_count: 50,
      middlegame_count: 50,
      endgame_count: 50,
      opening_blunders: 2,
      middlegame_blunders: 5,
      endgame_blunders: 3
    }])

    // Call 3: Trends query (last 100 rows)
    // We return 2 dummy rows to check logic
    // The query orders by analyzed_at DESC (Newest first)
    mockSql.mockResolvedValueOnce([
       { avg_centipawn_loss: 20, blunders: 0, analyzed_at: new Date('2023-01-02') }, // Newest
       { avg_centipawn_loss: 30, blunders: 1, analyzed_at: new Date('2023-01-01') }  // Older
    ])

    // Call 4: Engine info query (oldest first)
    mockSql.mockResolvedValueOnce([{
      engine_name: 'stockfish',
      engine_version: '16',
      analysis_depth: 20
    }])

    const result = await computeEngineSummary()

    // Assertions
    expect(result.totalGames).toBe(100)
    expect(result.gamesWithEngineAnalysis).toBe(50)
    expect(result.overall.avgCentipawnLoss).toBe(25.5)
    expect(result.overall.blunderRate).toBe(10 / 50) // 0.2
    expect(result.overall.mistakeRate).toBe(20 / 50)
    expect(result.overall.inaccuracyRate).toBe(30 / 50)

    // Check phase stats
    expect(result.byPhase.opening.avgCpl).toBe(10)
    expect(result.byPhase.opening.blunderRate).toBe(2 / 50)

    expect(result.byPhase.middlegame.avgCpl).toBe(20)
    expect(result.byPhase.middlegame.blunderRate).toBe(5 / 50)

    expect(result.byPhase.endgame.avgCpl).toBe(30)
    expect(result.byPhase.endgame.blunderRate).toBe(3 / 50)

    // Check trends
    // Trend rows returned: [Newest, Oldest]
    // Reversed in code: [Oldest, Newest]
    // Length: 2
    // recentCount = min(50, 1) = 1
    // recent = slice(-1) = [Newest] (CPL 20, B 0)
    // previous = slice(-2, -1) = [Oldest] (CPL 30, B 1)

    expect(result.trends.recent50.avgCpl).toBe(20)
    expect(result.trends.recent50.blunderRate).toBe(0)

    expect(result.trends.previous50.avgCpl).toBe(30)
    expect(result.trends.previous50.blunderRate).toBe(1)

    expect(result.trends.cplDelta).toBe(20 - 30) // -10
    expect(result.trends.blunderRateDelta).toBe(0 - 1) // -1

    // Check Engine Info
    expect(result.engineInfo.engineName).toBe('stockfish')
    expect(result.engineInfo.analysisDepth).toBe(20)
  })

  it('handles empty analysis correctly', async () => {
    mockSql.mockResolvedValueOnce([{ count: 100 }]) // Total games
    mockSql.mockResolvedValueOnce([{ games_with_analysis: 0 }]) // Aggregates (count 0)
    // Other queries shouldn't be called if gamesWithEngineAnalysis is 0

    const result = await computeEngineSummary()

    expect(result.gamesWithEngineAnalysis).toBe(0)
    expect(result.overall.avgCentipawnLoss).toBeNull()
    expect(result.trends.cplDelta).toBeNull()
  })
})
