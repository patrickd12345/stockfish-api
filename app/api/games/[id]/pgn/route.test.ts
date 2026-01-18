const { connectToDb, isDbConfigured, getGamePgn } = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  getGamePgn: vi.fn(async (): Promise<string | null> => null),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ getGamePgn }))

import { GET } from '@/app/api/games/[id]/pgn/route'

describe('app/api/games/[id]/pgn', () => {
  beforeEach(() => {
    connectToDb.mockClear()
    getGamePgn.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
  })

  it('returns 503 when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    const res = await GET({} as any, { params: { id: 'g1' } })
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Database is not configured' })
  })

  it('returns 404 when game is missing', async () => {
    getGamePgn.mockResolvedValueOnce(null)
    const res = await GET({} as any, { params: { id: 'missing' } })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns pgn when present', async () => {
    getGamePgn.mockResolvedValueOnce('PGN')
    const res = await GET({} as any, { params: { id: 'g1' } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ pgn: 'PGN' })
  })
})

