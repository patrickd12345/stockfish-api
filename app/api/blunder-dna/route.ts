import { NextRequest, NextResponse } from 'next/server'
import { requireProEntitlement, ForbiddenError } from '@/lib/entitlementGuard'
import { getUserAnalyzedGamesWithBlunders, getLatestBlunderDnaSnapshot, storeBlunderDnaSnapshot, isSnapshotValid } from '@/lib/blunderDnaStorage'
import { detectBlunders, aggregateBlunders } from '@/lib/blunderDnaV1'
import type { BlunderDetail } from '@/lib/engineAnalysis'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Compute a new Blunder DNA snapshot from analyzed games
 */
async function computeSnapshot(userId: string) {
  const gamesData = await getUserAnalyzedGamesWithBlunders(userId, 50)
  
  // Convert to BlunderDetail format and detect blunders
  const allEvents: Array<{ gameId: string; event: ReturnType<typeof detectBlunders>[0] }> = []
  
  for (const game of gamesData) {
    const blunders: BlunderDetail[] = game.blunders.map(blunder => ({
      moveNumber: blunder.moveNumber,
      ply: blunder.ply,
      fen: '', // Not needed for classification
      playedMove: blunder.playedMove,
      bestMove: blunder.bestMove,
      evalBefore: blunder.evalBefore,
      evalAfter: blunder.evalAfter,
      bestEval: blunder.evalBefore, // Approximate
      centipawnLoss: blunder.centipawnLoss,
    }))
    
    const events = detectBlunders(blunders, game.gameId)
    for (const event of events) {
      allEvents.push({ gameId: game.gameId, event })
    }
  }
  
  // Extract just the events for aggregation
  const events = allEvents.map(e => e.event)
  
  // Aggregate
  const patterns = aggregateBlunders(events)
  
  // Create snapshot
  const snapshot = {
    userId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    gamesAnalyzed: gamesData.length,
    blundersTotal: events.length,
    patterns,
    computedAt: new Date().toISOString(),
  }
  
  // Store snapshot
  await storeBlunderDnaSnapshot(snapshot)
  
  return snapshot
}

/**
 * GET /api/blunder-dna
 * Returns the latest Blunder DNA snapshot for the authenticated Pro user.
 * 
 * Query params:
 * - force=1: Force recompute even if valid snapshot exists
 * 
 * Behavior:
 * - If force=1, always recompute
 * - Otherwise, return existing snapshot if valid (within 24h TTL)
 * - Otherwise, compute new snapshot
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await requireProEntitlement(request)
    
    // Check for force refresh
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('force') === '1'
    
    // Get existing snapshot
    const existing = await getLatestBlunderDnaSnapshot(userId)
    
    // If force refresh, skip validation check
    if (forceRefresh) {
      const snapshot = await computeSnapshot(userId)
      return NextResponse.json({
        ok: true,
        snapshot,
      })
    }
    
    // Check if existing snapshot is valid (within TTL)
    if (existing && isSnapshotValid(existing)) {
      return NextResponse.json({
        ok: true,
        snapshot: existing,
      })
    }
    
    // Compute new snapshot (either no existing or expired)
    const snapshot = await computeSnapshot(userId)
    
    return NextResponse.json({
      ok: true,
      snapshot,
    })
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 403 }
      )
    }
    console.error('[Blunder DNA] GET failed:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get Blunder DNA' },
      { status: 500 }
    )
  }
}
