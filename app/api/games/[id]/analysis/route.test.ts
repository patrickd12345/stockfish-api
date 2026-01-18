const { connectToDb, isDbConfigured, getGameAnalysisData } = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  getGameAnalysisData: vi.fn(async (): Promise<any> => null),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ getGameAnalysisData }))

import { GET } from '@/app/api/games/[id]/analysis/route'

describe('app/api/games/[id]/analysis', () => {
  beforeEach(() => {
    connectToDb.mockClear()
    getGameAnalysisData.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
  })

  it('returns 503 when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    const res = await GET({} as any, { params: { id: 'g1' } })
    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: 'Database is not configured' })
    expect(connectToDb).not.toHaveBeenCalled()
  })

  it('returns 404 when game is not found', async () => {
    getGameAnalysisData.mockResolvedValueOnce(null)
    const res = await GET({} as any, { params: { id: 'g1' } })
    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: 'Game not found' })
  })

  it('returns analysis payload when found', async () => {
    getGameAnalysisData.mockResolvedValueOnce({
      pgn: '1. e4 e5',
      moves: [],
      pvSnapshots: [],
      engineVersion: '16',
      analysisDepth: 15,
    })
    const res = await GET({} as any, { params: { id: 'g1' } })
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      pgn: '1. e4 e5',
      moves: [],
      pvSnapshots: [],
      engineVersion: '16',
      analysisDepth: 15,
    })
  })
})
