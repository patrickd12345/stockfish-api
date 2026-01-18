const {
  analyzePgn,
  parsePgnWithoutEngine,
  connectToDb,
  isDbConfigured,
  createGame,
  runBatchAnalysis,
  buildEmbeddingText,
  getEmbedding,
} = vi.hoisted(() => ({
  analyzePgn: vi.fn(async (): Promise<any[]> => []),
  parsePgnWithoutEngine: vi.fn(async (): Promise<any[]> => []),
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  createGame: vi.fn(async () => {}),
  runBatchAnalysis: vi.fn(async (): Promise<any> => ({
    totalGames: 0,
    computedAt: 'x',
    period: { start: 'x', end: 'x', days: 0 },
  })),
  buildEmbeddingText: vi.fn(() => 'embed'),
  getEmbedding: vi.fn(async (): Promise<number[] | null> => [0.1, 0.2]),
}))

vi.mock('@/lib/analysis', () => ({ analyzePgn, parsePgnWithoutEngine }))
vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ createGame }))
vi.mock('@/lib/batchAnalysis', () => ({ runBatchAnalysis }))
vi.mock('@/lib/embeddings', () => ({ buildEmbeddingText, getEmbedding }))

import { POST } from '@/app/api/process-pgn/route'

describe('app/api/process-pgn', () => {
  beforeEach(() => {
    analyzePgn.mockReset()
    parsePgnWithoutEngine.mockReset()
    connectToDb.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
    createGame.mockReset()
    runBatchAnalysis.mockReset()
    buildEmbeddingText.mockReset().mockReturnValue('embed')
    getEmbedding.mockReset().mockResolvedValue([0.1, 0.2])
    delete process.env.ENGINE_ANALYSIS_MODE
  })

  it('returns 400 when PGN is missing', async () => {
    const fd = new FormData()
    const res = await POST({ formData: async () => fd } as any)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'PGN text is required' })
  })

  it('returns 400 when analyzePgn finds no games', async () => {
    parsePgnWithoutEngine.mockResolvedValueOnce([])
    const fd = new FormData()
    fd.set('pgn', 'something')
    const res = await POST({ formData: async () => fd } as any)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'No games found in PGN' })
  })

  it('returns saved:false when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    parsePgnWithoutEngine.mockResolvedValueOnce([
      { game: { blunders: 0, pgn_text: 'PGN' }, moves: [] },
    ] as any)

    const fd = new FormData()
    fd.set('pgn', 'PGN')
    const res = await POST({ formData: async () => fd } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual(
      expect.objectContaining({ saved: false, count: 1 })
    )
    expect(createGame).not.toHaveBeenCalled()
    expect(runBatchAnalysis).not.toHaveBeenCalled()
  })

  it('saves games, generates embeddings, and triggers batch analysis when db configured', async () => {
    parsePgnWithoutEngine.mockResolvedValueOnce([
      { game: { blunders: 0, pgn_text: 'PGN1' }, moves: [] },
      { game: { blunders: 1, pgn_text: 'PGN2' }, moves: [] },
    ] as any)

    const fd = new FormData()
    fd.set('pgn', 'PGN')
    const res = await POST({ formData: async () => fd } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(createGame).toHaveBeenCalledTimes(2)
    expect(buildEmbeddingText).toHaveBeenCalledTimes(2)
    expect(getEmbedding).toHaveBeenCalledTimes(2)
    expect(runBatchAnalysis).toHaveBeenCalledTimes(1)
  })

  it('uses inline engine analysis when mode is inline', async () => {
    process.env.ENGINE_ANALYSIS_MODE = 'inline'
    analyzePgn.mockResolvedValueOnce([{ game: { blunders: 0, pgn_text: 'PGN' }, moves: [] }] as any)
    const fd = new FormData()
    fd.set('pgn', 'PGN')
    const res = await POST({ formData: async () => fd } as any)
    expect(res.status).toBe(200)
    expect(analyzePgn).toHaveBeenCalled()
    expect(parsePgnWithoutEngine).not.toHaveBeenCalled()
  })
})

