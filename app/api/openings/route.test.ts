const { connectToDb, isDbConfigured, getOpeningStats } = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  getOpeningStats: vi.fn(async (): Promise<any[]> => []),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ getOpeningStats }))

import { GET } from '@/app/api/openings/route'

describe('app/api/openings', () => {
  beforeEach(() => {
    connectToDb.mockClear()
    getOpeningStats.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
  })

  it('returns empty list when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ openings: [] })
  })

  it('returns opening stats', async () => {
    getOpeningStats.mockResolvedValueOnce([
      {
        openingName: 'Ruy Lopez',
        games: 2,
        wins: 1,
        losses: 0,
        draws: 1,
        whiteScore: 0.75,
      },
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      openings: [
        {
          openingName: 'Ruy Lopez',
          games: 2,
          wins: 1,
          losses: 0,
          draws: 1,
          whiteScore: 0.75,
        },
      ],
    })
    expect(getOpeningStats).toHaveBeenCalledWith(200)
  })
})
