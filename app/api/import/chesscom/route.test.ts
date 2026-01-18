const {
  fetchPlayerGames,
  analyzePgn,
  parsePgnWithoutEngine,
  connectToDb,
  isDbConfigured,
  gameExists,
  gameExistsByPgnText,
  createGame,
  runBatchAnalysis,
} = vi.hoisted(() => ({
  fetchPlayerGames: vi.fn(async (): Promise<any[]> => []),
  analyzePgn: vi.fn(async (): Promise<any[]> => []),
  parsePgnWithoutEngine: vi.fn(async (): Promise<any[]> => []),
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  gameExists: vi.fn(async (): Promise<boolean> => false),
  gameExistsByPgnText: vi.fn(async (): Promise<boolean> => false),
  createGame: vi.fn(async () => {}),
  runBatchAnalysis: vi.fn(async (): Promise<any> => ({})),
}))

vi.mock('@/lib/chesscom', () => ({ fetchPlayerGames }))
vi.mock('@/lib/analysis', () => ({ analyzePgn, parsePgnWithoutEngine }))
vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/models', () => ({ createGame, gameExists, gameExistsByPgnText }))
vi.mock('@/lib/batchAnalysis', () => ({ runBatchAnalysis }))

import { POST } from '@/app/api/import/chesscom/route'

describe('app/api/import/chesscom', () => {
  beforeEach(() => {
    fetchPlayerGames.mockReset().mockResolvedValue([])
    analyzePgn.mockReset().mockResolvedValue([])
    parsePgnWithoutEngine.mockReset().mockResolvedValue([])
    connectToDb.mockClear()
    isDbConfigured.mockReset().mockReturnValue(true)
    gameExists.mockReset().mockResolvedValue(false)
    gameExistsByPgnText.mockReset().mockResolvedValue(false)
    createGame.mockReset()
    runBatchAnalysis.mockReset()
    delete process.env.ENGINE_ANALYSIS_MODE
  })

  it('returns 400 when username missing', async () => {
    const res = await POST({ json: async () => ({}) } as any)
    expect(res.status).toBe(400)
    await expect(res.json()).resolves.toEqual({ error: 'Username is required' })
  })

  it('returns count 0 when no games found', async () => {
    fetchPlayerGames.mockResolvedValueOnce([])
    const res = await POST({ json: async () => ({ username: 'p', mode: 'recent' }) } as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({ count: 0, message: 'No games found' })
  })

  it('processes games but does not save when db not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    fetchPlayerGames.mockResolvedValueOnce([{ pgn: 'PGN' }, { pgn: 'PGN2' }] as any)
    parsePgnWithoutEngine.mockResolvedValue([{ game: { blunders: 0, pgn_text: 'PGN' }, moves: [] }] as any)

    const res = await POST({ json: async () => ({ username: 'p', mode: 'recent' }) } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.count).toBe(2)
    expect(body.saved).toBe(0)
    expect(createGame).not.toHaveBeenCalled()
    expect(runBatchAnalysis).not.toHaveBeenCalled()
  })

  it('saves analyzed games and triggers batch analysis when new games saved', async () => {
    fetchPlayerGames.mockResolvedValueOnce([{ pgn: 'PGN' }] as any)
    parsePgnWithoutEngine.mockResolvedValueOnce([{ game: { blunders: 0, pgn_text: 'PGN' }, moves: [] }] as any)
    gameExistsByPgnText.mockResolvedValueOnce(false)

    const res = await POST({ json: async () => ({ username: 'p', mode: 'recent' }) } as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.saved).toBe(1)
    expect(createGame).toHaveBeenCalledTimes(1)
    expect(runBatchAnalysis).toHaveBeenCalledTimes(1)
  })

  it('uses inline engine analysis when mode is inline', async () => {
    process.env.ENGINE_ANALYSIS_MODE = 'inline'
    fetchPlayerGames.mockResolvedValueOnce([{ pgn: 'PGN' }] as any)
    analyzePgn.mockResolvedValueOnce([{ game: { blunders: 0, pgn_text: 'PGN' }, moves: [] }] as any)

    const res = await POST({ json: async () => ({ username: 'p', mode: 'recent' }) } as any)
    expect(res.status).toBe(200)
    expect(analyzePgn).toHaveBeenCalled()
    expect(parsePgnWithoutEngine).not.toHaveBeenCalled()
  })
})

