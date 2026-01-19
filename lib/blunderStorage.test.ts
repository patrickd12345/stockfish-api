import { vi, describe, it, expect, beforeEach } from 'vitest'
import { storeBlunderDetails } from './blunderStorage'
import { getSql } from './database'
import type { BlunderDetail } from './engineAnalysis'

// Mock the database module
vi.mock('./database', () => {
  return {
    connectToDb: vi.fn().mockResolvedValue(undefined),
    getSql: vi.fn(),
    isDbConfigured: vi.fn().mockReturnValue(true)
  }
})

describe('storeBlunderDetails', () => {
  let mockSql: any

  beforeEach(() => {
    mockSql = vi.fn().mockResolvedValue([])
    ;(getSql as any).mockReturnValue(mockSql)
  })

  it('should handle empty input', async () => {
    await storeBlunderDetails('game-uuid', 'stockfish', 15, [])

    // Check that one of the calls was the DELETE statement
    // Tagged template calls look like: mockSql(['DELETE ...'], values...)
    const deleteCall = mockSql.mock.calls.find((call: any[]) =>
      Array.isArray(call[0]) && call[0][0].includes('DELETE FROM analysis_blunders')
    )
    expect(deleteCall).toBeDefined()
  })

  it('should store blunders in a single batch using UNNEST with tagged template', async () => {
    const blunders: BlunderDetail[] = Array.from({ length: 10 }, (_, i) => ({
      moveNumber: i + 1,
      ply: i * 2,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedMove: 'e4',
      bestMove: 'e4',
      evalBefore: 10,
      evalAfter: 0,
      bestEval: 10,
      centipawnLoss: 250
    }))

    await storeBlunderDetails('game-uuid', 'stockfish', 15, blunders)

    // Find the INSERT call
    const insertCall = mockSql.mock.calls.find((call: any[]) =>
      Array.isArray(call[0]) && call[0].some((str: string) => str.includes('INSERT INTO analysis_blunders'))
    )

    expect(insertCall).toBeDefined()

    // Check SQL string parts
    const sqlParts = insertCall[0].join('')
    expect(sqlParts).toContain('SELECT * FROM UNNEST')
    expect(sqlParts).toContain('::uuid[]')
    expect(sqlParts).toContain('::int[]')

    // Check interpolated parameters (arguments 1..12)
    // 1st interpolated value (index 1) is game_id array
    expect(insertCall[1]).toHaveLength(10)
    expect(insertCall[1][0]).toBe('game-uuid')

    // 12th interpolated value (index 12) is centipawn_loss array
    expect(insertCall[12]).toHaveLength(10)
    expect(insertCall[12][0]).toBe(250)
  })

  it('should split into multiple batches for large input using UNNEST', async () => {
    const batchSize = 1000
    const totalItems = 2500
    // Expected batches: 1000, 1000, 500

    const blunders: BlunderDetail[] = Array.from({ length: totalItems }, (_, i) => ({
      moveNumber: i + 1,
      ply: i * 2,
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      playedMove: 'e4',
      bestMove: 'e4',
      evalBefore: 10,
      evalAfter: 0,
      bestEval: 10,
      centipawnLoss: 250
    }))

    await storeBlunderDetails('game-uuid', 'stockfish', 15, blunders)

    // Find all INSERT calls
    const insertCalls = mockSql.mock.calls.filter((call: any[]) =>
      Array.isArray(call[0]) && call[0].some((str: string) => str.includes('INSERT INTO analysis_blunders'))
    )

    expect(insertCalls.length).toBe(3)

    // Batch 1: 1000 items -> interpolated arrays of length 1000
    expect(insertCalls[0][1]).toHaveLength(1000)

    // Batch 2: 1000 items
    expect(insertCalls[1][1]).toHaveLength(1000)

    // Batch 3: 500 items
    expect(insertCalls[2][1]).toHaveLength(500)
  })
})
