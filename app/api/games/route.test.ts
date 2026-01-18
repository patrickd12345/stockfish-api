const { connectToDb, isDbConfigured, getGames, searchGames } = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  getGames: vi.fn(async (): Promise<any[]> => []),
  searchGames: vi.fn(async (): Promise<any[]> => []),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ getGames, searchGames }))

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
    const res = await GET({ url: 'http://test.local/api/games' } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ games: [{ id: 'g1' }] })
    expect(getGames).toHaveBeenCalledWith(500)
    expect(searchGames).not.toHaveBeenCalled()
  })

  it('calls searchGames when query provided', async () => {
    searchGames.mockResolvedValueOnce([{ id: 'g2' }])
    const res = await GET({ url: 'http://test.local/api/games?q=ruy' } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ games: [{ id: 'g2' }] })
    expect(searchGames).toHaveBeenCalledWith('ruy')
  })
})

