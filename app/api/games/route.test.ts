const {
  connectToDb,
  isDbConfigured,
  getGames,
  searchGames,
  getLichessGameSummaries,
  searchLichessGameSummaries,
  getGamesByOpeningOutcome,
  getGamesByOpeningOutcomeCount,
} = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  getGames: vi.fn(async (): Promise<any[]> => []),
  searchGames: vi.fn(async (): Promise<any[]> => []),
  getLichessGameSummaries: vi.fn(async (): Promise<any[]> => []),
  searchLichessGameSummaries: vi.fn(async (): Promise<any[]> => []),
  getGamesByOpeningOutcome: vi.fn(async (): Promise<any[]> => []),
  getGamesByOpeningOutcomeCount: vi.fn(async (): Promise<number> => 0),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({
  getGames,
  searchGames,
  getLichessGameSummaries,
  searchLichessGameSummaries,
  getGamesByOpeningOutcome,
  getGamesByOpeningOutcomeCount,
}))

import { GET } from '@/app/api/games/route'

describe('app/api/games', () => {
  beforeEach(() => {
    connectToDb.mockClear()
    getGames.mockClear()
    searchGames.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
  })

  it('returns empty list when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    const res = await GET({ url: 'http://test.local/api/games' } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ games: [] })
    expect(connectToDb).not.toHaveBeenCalled()
  })

  it('calls getGames when no query', async () => {
    getGames.mockResolvedValueOnce([{ id: 'g1' }])
    getLichessGameSummaries.mockResolvedValueOnce([{ id: 'lichess:abcd', createdAt: new Date('2026-01-01T00:00:00Z') }])
    const res = await GET({ url: 'http://test.local/api/games' } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      games: [
        { id: 'lichess:abcd', createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'g1' },
      ],
      totalCount: null,
    })
    expect(getGames).toHaveBeenCalledWith(500)
    expect(getLichessGameSummaries).toHaveBeenCalledWith(120)
    expect(searchGames).not.toHaveBeenCalled()
  })

  it('calls searchGames when query provided', async () => {
    searchGames.mockResolvedValueOnce([{ id: 'g2' }])
    searchLichessGameSummaries.mockResolvedValueOnce([{ id: 'lichess:q', createdAt: new Date('2026-01-02T00:00:00Z') }])
    const res = await GET({ url: 'http://test.local/api/games?q=ruy' } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      games: [
        { id: 'lichess:q', createdAt: '2026-01-02T00:00:00.000Z' },
        { id: 'g2' },
      ],
      totalCount: null,
    })
    expect(searchGames).toHaveBeenCalledWith('ruy')
    expect(searchLichessGameSummaries).toHaveBeenCalledWith('ruy', 80)
  })
})

