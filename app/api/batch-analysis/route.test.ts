const { runBatchAnalysis, getProgressionSummaryMetadata } = vi.hoisted(() => ({
  runBatchAnalysis: vi.fn(async (): Promise<any> => ({
    totalGames: 10,
    computedAt: '2026-01-18T00:00:00.000Z',
    period: { start: '2026-01-01', end: '2026-01-18', days: 17 },
  })),
  getProgressionSummaryMetadata: vi.fn(async (): Promise<any> => null),
}))

import { NextRequest } from 'next/server'

const FeatureAccessError = vi.hoisted(() => {
  class FeatureAccessError extends Error {
    constructor(m: string) {
      super(m)
      this.name = 'FeatureAccessError'
    }
  }
  return FeatureAccessError
})

const requireFeatureForUser = vi.hoisted(() => vi.fn())

vi.mock('@/lib/batchAnalysis', () => ({ runBatchAnalysis }))
vi.mock('@/lib/progressionStorage', () => ({ getProgressionSummaryMetadata }))
vi.mock('@/lib/featureGate/server', () => ({
  requireFeatureForUser,
  FeatureAccessError,
}))

import { GET, POST } from '@/app/api/batch-analysis/route'

describe('app/api/batch-analysis', () => {
  const request = (cookie?: string) =>
    new NextRequest('http://x/api/batch-analysis', {
      method: 'POST',
      headers: cookie ? { Cookie: cookie } : undefined,
    })

  beforeEach(() => {
    runBatchAnalysis.mockReset()
    getProgressionSummaryMetadata.mockReset().mockResolvedValue(null)
    requireFeatureForUser.mockReset().mockResolvedValue(undefined)
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

  it('POST returns 403 when not Pro', async () => {
    requireFeatureForUser.mockRejectedValueOnce(new (FeatureAccessError as any)('Upgrade required to use Batch Analysis.'))
    const res = await POST(request('lichess_user_id=free-user'))
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.success).toBe(false)
    expect(body.error).toContain('Upgrade required')
    expect(runBatchAnalysis).not.toHaveBeenCalled()
  })

  it('POST runs batch analysis and returns summary when Pro', async () => {
    requireFeatureForUser.mockResolvedValueOnce({ userId: 'pro-user', tier: 'PRO' })
    runBatchAnalysis.mockResolvedValueOnce({
      totalGames: 10,
      computedAt: '2026-01-18T00:00:00.000Z',
      period: { start: '2026-01-01', end: '2026-01-18', days: 17 },
    } as any)

    const res = await POST(request('lichess_user_id=pro-user'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.summary.totalGames).toBe(10)
    expect(requireFeatureForUser).toHaveBeenCalledTimes(1)
  })

  it('POST returns 500 on failure', async () => {
    requireFeatureForUser.mockResolvedValueOnce({ userId: 'pro-user', tier: 'PRO' })
    runBatchAnalysis.mockRejectedValueOnce(new Error('nope'))
    const res = await POST(request('lichess_user_id=pro-user'))
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({
      success: false,
      error: 'nope',
    })
  })
})

