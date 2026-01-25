import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { GET } from '@/app/api/blunder-dna/route'
import * as blunderDnaStorage from '@/lib/blunderDnaStorage'
import * as featureGate from '@/lib/featureGate/server'
import type { BlunderDnaSnapshot } from '@/lib/blunderDnaV1'

// Mock dependencies
const sqlMock = vi.fn()
const getPatternSummariesMock = vi.fn()

vi.mock('@/lib/featureGate/server', () => ({
  requireFeatureForUser: vi.fn(),
  FeatureAccessError: class extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'FeatureAccessError'
    }
  },
}))

vi.mock('@/lib/database', () => ({
  connectToDb: vi.fn(async () => undefined),
  getSql: () => ((...args: any[]) => sqlMock(...args)),
  isNeonQuotaError: (e: any) => {
    const msg = e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e)
    return msg.includes('402') || /data transfer quota/i.test(msg) || /exceeded.*quota/i.test(msg)
  },
}))

vi.mock('@/lib/blunderDna', () => ({
  getPatternSummaries: (...args: any[]) => getPatternSummariesMock(...args),
}))

vi.mock('@/lib/blunderDnaStorage', () => ({
  getUserAnalyzedGamesWithBlunders: vi.fn(),
  getLatestBlunderDnaSnapshot: vi.fn(),
  storeBlunderDnaSnapshot: vi.fn(),
  isSnapshotValid: vi.fn(),
  normalizePlayerName: vi.fn(),
}))

describe('GET /api/blunder-dna', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    getPatternSummariesMock.mockResolvedValue([
      {
        patternTag: 'missed_threat',
        label: 'Missed threat',
        occurrences: 5,
        weaknessScore: 1,
        updatedAt: new Date().toISOString(),
      },
    ])

    sqlMock.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = strings.join('')
      if (text.includes('SELECT DISTINCT lichess_game_id')) {
        return [{ lichess_game_id: 'g1' }, { lichess_game_id: 'g2' }]
      }
      if (text.includes('SELECT COUNT(DISTINCT lichess_game_id) as count')) {
        return [{ count: 50 }]
      }
      if (text.includes('SELECT COUNT(*) as count')) {
        return [{ count: 8 }]
      }
      if (text.includes('SELECT lichess_game_id, ply, pattern_tag, eval_before, eval_after')) {
        return [
          {
            lichess_game_id: 'g1',
            ply: 10,
            pattern_tag: 'missed_threat',
            eval_before: 0.2,
            eval_after: -1.2,
          },
        ]
      }
      return []
    })
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
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true)
    
    const request = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.snapshot).toEqual(mockSnapshot)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).not.toHaveBeenCalled()
  })
  
  it('recomputes snapshot if expired (older than 24h)', async () => {
    const expiredSnapshot: BlunderDnaSnapshot = {
      ...mockSnapshot,
      computedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(), // 25h ago
    }
    
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(expiredSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(false)
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.snapshot.userId).toBe(mockUserId)
    expect(data.snapshot.gamesAnalyzed).toBe(50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalledTimes(1)
  })
  
  it('recomputes snapshot if none exists', async () => {
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(null)
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(data.snapshot.userId).toBe(mockUserId)
    expect(data.snapshot.gamesAnalyzed).toBe(50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalledTimes(1)
  })
  
  it('forces recompute when force=1 query param is present', async () => {
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true) // Valid, but force overrides
    vi.mocked(blunderDnaStorage.getUserAnalyzedGamesWithBlunders).mockResolvedValue([])
    vi.mocked(blunderDnaStorage.storeBlunderDnaSnapshot).mockResolvedValue()
    
    const request = new NextRequest('http://localhost/api/blunder-dna?force=1', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    // Should recompute even though snapshot is valid
    expect(data.snapshot.userId).toBe(mockUserId)
    expect(data.snapshot.gamesAnalyzed).toBe(50)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).toHaveBeenCalledTimes(1)
  })
  
  it('does not force recompute when force=0 or missing', async () => {
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(mockSnapshot)
    vi.mocked(blunderDnaStorage.isSnapshotValid).mockReturnValue(true)
    
    const request1 = new NextRequest('http://localhost/api/blunder-dna?force=0', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response1 = await GET(request1)
    expect(response1.status).toBe(200)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).not.toHaveBeenCalled()
    
    vi.clearAllMocks()
    
    const request2 = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response2 = await GET(request2)
    expect(response2.status).toBe(200)
    expect(blunderDnaStorage.storeBlunderDnaSnapshot).not.toHaveBeenCalled()
  })

  it('returns 503 with quotaExceeded when database quota is exceeded', async () => {
    vi.mocked(featureGate.requireFeatureForUser).mockResolvedValue({
      userId: mockUserId,
      tier: 'PRO',
    })
    vi.mocked(blunderDnaStorage.getLatestBlunderDnaSnapshot).mockResolvedValue(null)
    sqlMock.mockRejectedValueOnce(new Error('Server error (HTTP status 402): Your project has exceeded the data transfer quota.'))

    const request = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(503)
    expect(data.ok).toBe(false)
    expect(data.quotaExceeded).toBe(true)
  })
  
  it('returns 403 for non-Pro users', async () => {
    vi.mocked(featureGate.requireFeatureForUser).mockRejectedValue(
      new (featureGate as any).FeatureAccessError('Upgrade required to use Blunder DNA.')
    )
    
    const request = new NextRequest('http://localhost/api/blunder-dna', {
      headers: { Cookie: `lichess_user_id=${mockUserId}` },
    })
    const response = await GET(request)
    const data = await response.json()
    
    expect(response.status).toBe(403)
    expect(data.ok).toBe(false)
    expect(data.error).toContain('Upgrade required')
  })
})
