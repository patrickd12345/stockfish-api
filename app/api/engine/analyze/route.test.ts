import { NextRequest } from 'next/server'
import { vi } from 'vitest'

const {
  connectToDb,
  isDbConfigured,
  requireProEntitlement,
  ForbiddenError,
  getAnalysisCoverage,
  enqueueEngineAnalysisJobs,
  getGamesNeedingAnalysis,
  analyzeGameWithEngineInternal,
  storeEngineAnalysis,
  markAnalysisFailed,
  computeEngineSummary,
  storeEngineSummary,
} = vi.hoisted(() => ({
  connectToDb: vi.fn(async () => {}),
  isDbConfigured: vi.fn(() => true),
  requireProEntitlement: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {
    constructor(m: string) {
      super(m)
      this.name = 'ForbiddenError'
    }
  },
  getAnalysisCoverage: vi.fn(async () => ({ totalGames: 0, analyzedGames: 0, failedGames: 0, pendingGames: 0 })),
  enqueueEngineAnalysisJobs: vi.fn(async () => ({ enqueued: 2, skipped: 0 })),
  getGamesNeedingAnalysis: vi.fn(async () => []),
  analyzeGameWithEngineInternal: vi.fn(async () => ({ moves: [], engineVersion: null })),
  storeEngineAnalysis: vi.fn(async () => {}),
  markAnalysisFailed: vi.fn(async () => {}),
  computeEngineSummary: vi.fn(async () => ({ coveragePercent: 0, gamesWithEngineAnalysis: 0, overall: {} })),
  storeEngineSummary: vi.fn(async () => {}),
}))

vi.mock('@/lib/database', () => ({ connectToDb, isDbConfigured }))
vi.mock('@/lib/entitlementGuard', () => ({
  requireProEntitlement,
  ForbiddenError,
  getUserIdFromRequest: vi.fn(),
}))
vi.mock('@/lib/engineStorage', () => ({
  getGamesNeedingAnalysis,
  storeEngineAnalysis,
  markAnalysisFailed,
  getAnalysisCoverage,
}))
vi.mock('@/lib/engineQueue', () => ({ enqueueEngineAnalysisJobs }))
vi.mock('@/lib/engineAnalysis', () => ({ analyzeGameWithEngineInternal }))
vi.mock('@/lib/engineSummaryAnalysis', () => ({ computeEngineSummary }))
vi.mock('@/lib/engineSummaryStorage', () => ({ storeEngineSummary }))

import { POST } from '@/app/api/engine/analyze/route'

function jsonRequest(body: object, cookie?: string): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cookie) headers['Cookie'] = cookie
  return new NextRequest('http://test/api/engine/analyze', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  })
}

describe('app/api/engine/analyze', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isDbConfigured.mockReturnValue(true)
    requireProEntitlement.mockReset()
  })

  it('returns 500 when db is not configured', async () => {
    isDbConfigured.mockReturnValueOnce(false)
    const req = jsonRequest({ mode: 'enqueue', limit: 5 })
    const res = await POST(req)
    expect(res.status).toBe(500)
    await expect(res.json()).resolves.toEqual({ error: 'Database not configured' })
    expect(requireProEntitlement).not.toHaveBeenCalled()
    expect(enqueueEngineAnalysisJobs).not.toHaveBeenCalled()
    expect(analyzeGameWithEngineInternal).not.toHaveBeenCalled()
  })

  it('returns 403 when not authenticated (no cookie)', async () => {
    requireProEntitlement.mockRejectedValueOnce(new ForbiddenError('Authentication required'))
    const req = jsonRequest({ mode: 'enqueue', limit: 5 })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Authentication required')
    expect(enqueueEngineAnalysisJobs).not.toHaveBeenCalled()
    expect(analyzeGameWithEngineInternal).not.toHaveBeenCalled()
  })

  it('returns 403 when user is Free (not Pro)', async () => {
    requireProEntitlement.mockRejectedValueOnce(
      new ForbiddenError('Pro subscription required for server-side analysis')
    )
    const req = jsonRequest({ mode: 'enqueue', limit: 5 })
    const res = await POST(req)
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toContain('Pro subscription')
    expect(enqueueEngineAnalysisJobs).not.toHaveBeenCalled()
    expect(analyzeGameWithEngineInternal).not.toHaveBeenCalled()
  })

  it('returns 202 with enqueued count when Pro and mode enqueue', async () => {
    requireProEntitlement.mockResolvedValueOnce({ userId: 'pro-user', entitlement: { plan: 'PRO' } as any })
    enqueueEngineAnalysisJobs.mockResolvedValueOnce({ enqueued: 3, skipped: 1 })
    const req = jsonRequest({ mode: 'enqueue', limit: 10, analysisDepth: 20 })
    const res = await POST(req)
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('enqueue')
    expect(body.enqueued).toBe(3)
    expect(body.skipped).toBe(1)
    expect(body.analysisDepth).toBe(20)
    expect(enqueueEngineAnalysisJobs).toHaveBeenCalledWith(10, 'stockfish', 20)
    expect(analyzeGameWithEngineInternal).not.toHaveBeenCalled()
  })

  it('uses full depth range for Pro (no cap at 15)', async () => {
    requireProEntitlement.mockResolvedValueOnce({ userId: 'pro-user', entitlement: { plan: 'PRO' } as any })
    enqueueEngineAnalysisJobs.mockResolvedValueOnce({ enqueued: 0, skipped: 0 })
    const req = jsonRequest({ mode: 'enqueue', limit: 5, analysisDepth: 25 })
    const res = await POST(req)
    expect(res.status).toBe(202)
    expect(enqueueEngineAnalysisJobs).toHaveBeenCalledWith(5, 'stockfish', 25)
  })

  it('runs inline analysis when Pro and mode inline', async () => {
    requireProEntitlement.mockResolvedValueOnce({ userId: 'pro-user', entitlement: { plan: 'PRO' } as any })
    getGamesNeedingAnalysis.mockResolvedValueOnce([{ id: 'g1', pgn_text: '1. e4 e5' }] as any)
    analyzeGameWithEngineInternal.mockResolvedValueOnce({ moves: [], engineVersion: '16' } as any)
    computeEngineSummary.mockResolvedValueOnce({ coveragePercent: 100, gamesWithEngineAnalysis: 1, overall: {} } as any)
    const req = jsonRequest({ mode: 'inline', limit: 5, analysisDepth: 18 })
    const res = await POST(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.mode).toBe('inline')
    expect(body.succeeded).toBe(1)
    expect(analyzeGameWithEngineInternal).toHaveBeenCalledTimes(1)
    expect(storeEngineAnalysis).toHaveBeenCalledWith('g1', expect.any(Object), 'stockfish')
  })

  it('does not call engine or enqueue when 403', async () => {
    requireProEntitlement.mockRejectedValueOnce(
      new ForbiddenError('Pro subscription required for server-side analysis')
    )
    const req = jsonRequest({ mode: 'inline', limit: 5 })
    await POST(req)
    expect(analyzeGameWithEngineInternal).not.toHaveBeenCalled()
    expect(enqueueEngineAnalysisJobs).not.toHaveBeenCalled()
    expect(getGamesNeedingAnalysis).not.toHaveBeenCalled()
  })
})
