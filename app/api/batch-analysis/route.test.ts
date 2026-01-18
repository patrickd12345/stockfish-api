const { runBatchAnalysis, getProgressionSummaryMetadata } = vi.hoisted(() => ({
  runBatchAnalysis: vi.fn(async (): Promise<any> => ({
    totalGames: 10,
    computedAt: '2026-01-18T00:00:00.000Z',
    period: { start: '2026-01-01', end: '2026-01-18', days: 17 },
  })),
  getProgressionSummaryMetadata: vi.fn(async (): Promise<any> => null),
}))

vi.mock('@/lib/batchAnalysis', () => ({ runBatchAnalysis }))
vi.mock('@/lib/progressionStorage', () => ({ getProgressionSummaryMetadata }))

import { GET, POST } from '@/app/api/batch-analysis/route'

describe('app/api/batch-analysis', () => {
  beforeEach(() => {
    runBatchAnalysis.mockReset()
    getProgressionSummaryMetadata.mockReset().mockResolvedValue(null)
  })

  it('GET returns exists:false when metadata is null', async () => {
    getProgressionSummaryMetadata.mockResolvedValueOnce(null)
    const res = await GET({} as any)
    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toEqual({
      exists: false,
      message: 'Unable to check batch analysis status',
    })
  })

  it('GET returns needsUpdate when counts differ', async () => {
    getProgressionSummaryMetadata.mockResolvedValueOnce({
      exists: true,
      gameCountUsed: 10,
      currentGameCount: 12,
      computedAt: '2026-01-18T00:00:00.000Z',
    })

    const res = await GET({} as any)
    const body = await res.json()
    expect(body.needsUpdate).toBe(true)
    expect(body.exists).toBe(true)
  })

  it('POST runs batch analysis and returns summary', async () => {
    runBatchAnalysis.mockResolvedValueOnce({
      totalGames: 10,
      computedAt: '2026-01-18T00:00:00.000Z',
      period: { start: '2026-01-01', end: '2026-01-18', days: 17 },
    } as any)

    const res = await POST({} as any)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.totalGames).toBe(10)
  })

  it('POST returns 500 on failure', async () => {
    runBatchAnalysis.mockRejectedValueOnce(new Error('nope'))
    const res = await POST({} as any)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'nope',
    })
  })
})

