const sql = vi.fn(async () => [])

vi.mock('@/lib/database', () => ({
  getSql: () => sql,
}))

import {
  createGame,
  getGameCount,
  getGamePgn,
  getGameSummaries,
  getGames,
  searchGames,
  searchGamesByEmbedding,
} from '@/lib/models'

describe('lib/models', () => {
  beforeEach(() => {
    sql.mockClear()
  })

  function lastSqlText(): string {
    const call = sql.mock.calls.at(-1)
    if (!call) return ''
    return (call[0] as TemplateStringsArray).join('')
  }

  function lastSqlValues(): unknown[] {
    const call = sql.mock.calls.at(-1)
    if (!call) return []
    return call.slice(1)
  }

  it('getGames maps DB rows to domain shape', async () => {
    sql.mockResolvedValueOnce([
      {
        id: 'g1',
        date: '2026-01-01',
        white: 'Alice',
        black: 'Bob',
        result: '1-0',
        opening_name: 'Ruy Lopez',
        my_accuracy: 99.5,
        blunders: 0,
        pgn_text: 'PGN',
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ])

    const games = await getGames(1)
    expect(games).toHaveLength(1)
    expect(games[0]).toMatchObject({
      id: 'g1',
      white: 'Alice',
      black: 'Bob',
      opening_name: 'Ruy Lopez',
      pgn_text: 'PGN',
    })
    expect(games[0].createdAt).toBeInstanceOf(Date)
  })

  it('getGameSummaries returns minimal rows', async () => {
    sql.mockResolvedValueOnce([
      {
        id: 'g1',
        date: '2026-01-01',
        white: 'Alice',
        black: 'Bob',
        result: '1-0',
        opening_name: 'Ruy Lopez',
        my_accuracy: 98.1,
        blunders: 1,
        created_at: new Date('2026-01-01T00:00:00Z'),
      },
    ])

    const summaries = await getGameSummaries(1)
    expect(summaries[0]).toEqual(
      expect.objectContaining({
        id: 'g1',
        blunders: 1,
        createdAt: expect.any(Date),
      })
    )
  })

  it('searchGames uses ILIKE search term', async () => {
    sql.mockResolvedValueOnce([])
    await searchGames('ruy', 50)
    expect(lastSqlText()).toContain('ILIKE')
    expect(lastSqlValues()).toContain('%ruy%')
  })

  it('getGameCount returns count', async () => {
    sql.mockResolvedValueOnce([{ count: 3 }])
    await expect(getGameCount()).resolves.toBe(3)
  })

  it('getGamePgn returns null if row missing', async () => {
    sql.mockResolvedValueOnce([])
    await expect(getGamePgn('missing')).resolves.toBeNull()
  })

  it('createGame inserts without embedding when embedding is null', async () => {
    sql.mockResolvedValueOnce([])
    await createGame({
      date: '2026-01-01',
      white: 'Alice',
      black: 'Bob',
      result: '1-0',
      opening_name: 'Ruy Lopez',
      my_accuracy: 100,
      blunders: 0,
      pgn_text: 'PGN',
      moves: [],
      embedding: null,
    })

    expect(lastSqlText()).toContain('INSERT INTO games')
    expect(lastSqlText().toLowerCase()).not.toContain('embedding)')
  })

  it('createGame inserts with embedding when provided', async () => {
    sql.mockResolvedValueOnce([])
    await createGame({
      date: '2026-01-01',
      white: 'Alice',
      black: 'Bob',
      result: '1-0',
      opening_name: 'Ruy Lopez',
      my_accuracy: 100,
      blunders: 0,
      pgn_text: 'PGN',
      moves: [],
      embedding: [1, 2],
    })

    expect(lastSqlText()).toContain('embedding')
    // The vector literal is passed as a parameter value.
    expect(lastSqlValues()).toContain('[1,2]')
  })

  it('searchGamesByEmbedding orders by vector distance and returns distance', async () => {
    sql.mockResolvedValueOnce([
      {
        id: 'g1',
        date: '2026-01-01',
        white: 'Alice',
        black: 'Bob',
        result: '1-0',
        opening_name: 'Ruy Lopez',
        my_accuracy: 99.5,
        blunders: 0,
        pgn_text: 'PGN',
        created_at: new Date('2026-01-01T00:00:00Z'),
        distance: 0.123,
      },
    ])

    const results = await searchGamesByEmbedding([1, 2, 3], 1)
    expect(lastSqlText()).toContain('<->')
    expect(results[0]).toEqual(
      expect.objectContaining({
        id: 'g1',
        distance: 0.123,
      })
    )
  })
})

