import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/blunder-dna/route'
import * as blunderDnaStorage from '@/lib/blunderDnaStorage'
import * as entitlementGuard from '@/lib/entitlementGuard'
import type { BlunderDnaSnapshot } from '@/lib/blunderDnaV1'

// Mock dependencies
vi.mock('@/lib/entitlementGuard', () => ({
  requireProEntitlement: vi.fn(),
  ForbiddenError: class extends Error {
    code = 'PRO_REQUIRED'
    constructor(message: string) {
      super(message)
      this.name = 'ForbiddenError'
    }
  },
}))

vi.mock('@/lib/blunderDnaStorage', () => ({
  getUserAnalyzedGamesWithBlunders: vi.fn(),
  getLatestBlunderDnaSnapshot: vi.fn(),
  storeBlunderDnaSnapshot: vi.fn(),
  isSnapshotValid: vi.fn(),
  normalizePlayerName: vi.fn(),
}))

vi.mock('@/lib/blunderDnaV1', () => ({
  detectBlunders: vi.fn(() => []),
  aggregateBlunders: vi.fn(() => []),
}))

describe('GET /api/blunder-dna', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  
  const mockUserId = 'testuser'
  const mockSnapshot: BlunderDnaSnapshot = {
    userId: mockUserId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    gamesAnalyzed: 10,
    blundersTotal: 5,
    patterns: [],
    computedAt: new Date().toISOString(),
  }
  
  it('returns existing snapshot if valid (within TTL)', async () => {
    vi.mocked(entitlementGuard.requireProEntitlement).mockResolvedValue({
      userId: mockUserId,
      entitlement: { plan: 'PRO', status: 'ACTIVE', current_period_end: null, cancel_at_period_end: false },
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true)
    
    const request = new NextRequest('http://localhost/api/blunder-dna')
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.snapshot).toEqual(mockSnapshot)
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).not.toHaveBeenCalled()
  })
  
  it('recomputes snapshot if expired (older than 24h)', async () => {
    const expiredSnapshot: BlunderDnaSnapshot = {
      ...mockSnapshot,
      computedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
    }
    
    vi.mocked(entitlementGuard.requireProEntitlement).mockResolvedValue({
      userId: mockUserId,
      entitlement: { plan: 'PRO', status: 'ACTIVE', current_period_end: null, cancel_at_period_end: false },
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(expiredSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(false)
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna')
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).toHaveBeenCalledWith(mockUserId, 50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalled()
  })
  
  it('recomputes snapshot if none exists', async () => {
    vi.mocked(entitlementGuard.requireProEntitlement).mockResolvedValue({
      userId: mockUserId,
      entitlement: { plan: 'PRO', status: 'ACTIVE', current_period_end: null, cancel_at_period_end: false },
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(null)
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna')
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).toHaveBeenCalledWith(mockUserId, 50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalled()
  })
  
  it('forces recompute when force=1 query param is present', async () => {
    vi.mocked(entitlementGuard.requireProEntitlement).mockResolvedValue({
      userId: mockUserId,
      entitlement: { plan: 'PRO', status: 'ACTIVE', current_period_end: null, cancel_at_period_end: false },
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true) // Valid, but force overrides
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna?force=1')
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    // Should recompute even though snapshot is valid
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).toHaveBeenCalledWith(mockUserId, 50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalled()
  })
  
  it('does not force recompute when force=0 or missing', async () => {
    vi.mocked(entitlementGuard.requireProEntitlement).mockResolvedValue({
      userId: mockUserId,
      entitlement: { plan: 'PRO', status: 'ACTIVE', current_period_end: null, cancel_at_period_end: false },
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true)
    
    const request1 = new NextRequest('http://localhost/api/blunder-dna?force=0')
    const response1 = await GET(request1)
    expect(response1.status).toBe(200)
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).not.toHaveBeenCalled()
    
    vi.clearAllMocks()
    
    const request2 = new NextRequest('http://localhost/api/blunder-dna')
    const response2 = await GET(request2)
    expect(response2.status).toBe(200)
    expect(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).not.toHaveBeenCalled()
  })
  
  it('returns 403 for non-Pro users', async () => {
    vi.mocked(entitlementGuard.requireProEntitlement).mockRejectedValue(
      new entitlementGuard.ForbiddenError('Pro subscription required')
    )
    
    const request = new NextRequest('http://localhost/api/blunder-dna')
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.code).toBe('PRO_REQUIRED')
  })
})
