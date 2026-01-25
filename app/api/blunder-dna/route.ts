import { NextRequest, NextResponse } from 'next/server'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'
import { getLatestBlunderDnaSnapshot, storeBlunderDnaSnapshot, isSnapshotValid } from '@/lib/blunderDnaStorage'
import { getPatternSummaries, type PatternTag } from '@/lib/blunderDna'
import { connectToDb, getSql } from '@/lib/database'
import type { BlunderDnaSnapshot, BlunderPattern } from '@/lib/blunderDnaV1'
import { BlunderTheme, GamePhase } from '@/lib/blunderDnaV1'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Convert PatternTag to BlunderTheme
 */
function patternTagToTheme(tag: PatternTag): BlunderTheme {
  switch (tag) {
    case 'hanging_piece': return BlunderTheme.HANGING_PIECE
    case 'missed_threat': return BlunderTheme.MISSED_THREAT
    case 'missed_win': return BlunderTheme.MISSED_WIN
    case 'unsafe_king': return BlunderTheme.UNSAFE_KING
    case 'bad_capture': return BlunderTheme.BAD_CAPTURE
    case 'time_trouble_collapse': return BlunderTheme.TIME_TROUBLE
    default: return BlunderTheme.MISSED_THREAT
  }
}

/**
 * Get phase from ply (move number)
 */
function getPhaseFromPly(ply: number): GamePhase {
  const moveNumber = Math.ceil((ply + 1) / 2)
  if (moveNumber <= 15) return GamePhase.OPENING
  if (moveNumber <= 30) return GamePhase.MIDDLEGAME
  return GamePhase.ENDGAME
}

/**
 * Compute a new Blunder DNA snapshot from stored drills and patterns
 */
async function computeSnapshot(userId: string): Promise<BlunderDnaSnapshot> {
  await connectToDb()
  const sql = getSql()
  
  console.log(`[Blunder DNA] Computing snapshot for user: ${userId}`)
  
  // Get patterns that were already computed
  const patterns = await getPatternSummaries(userId)
  console.log(`[Blunder DNA] Found ${patterns.length} patterns`)
  
  // Count unique games from drills (games WITH blunders)
  const gameRows = (await sql`
    SELECT DISTINCT lichess_game_id
    FROM public.blunder_dna_drills
    WHERE lichess_user_id = ${userId}
  `) as Array<{ lichess_game_id: string }>
  
  const gamesWithDrills = gameRows.length
  
  // Count games that were actually analyzed for Blunder DNA
  // Only Lichess games are analyzed - Chess.com games are not processed for Blunder DNA
  const analyzedGamesRows = (await sql`
    SELECT COUNT(DISTINCT lichess_game_id) as count
    FROM public.lichess_recent_games
    WHERE lichess_user_id = ${userId}
  `) as Array<{ count: number }>
  
  const gamesAnalyzed = Number(analyzedGamesRows[0]?.count || 0)
  
  console.log(`[Blunder DNA] Found ${gamesWithDrills} unique games from drills, ${gamesAnalyzed} games analyzed for Blunder DNA`)
  
  // Count total blunders - sum of occurrences from all patterns (not just stored drills)
  // This gives the actual count of blunders found, not just drills stored (which are limited by nPerPattern)
  const blundersTotal = patterns.reduce((sum, p) => sum + (p.occurrences || 0), 0)
  
  // Also count stored drills for reference
  const drillCountRows = (await sql`
    SELECT COUNT(*) as count
    FROM public.blunder_dna_drills
    WHERE lichess_user_id = ${userId}
  `) as Array<{ count: number }>
  
  const drillsStored = Number(drillCountRows[0]?.count || 0)
  console.log(`[Blunder DNA] Found ${blundersTotal} total blunders (from patterns), ${drillsStored} drills stored`)
  
  // Get drills to compute phase distribution, example game IDs, and actual centipawn loss
  const drillRows = (await sql`
    SELECT lichess_game_id, ply, pattern_tag, eval_before, eval_after
    FROM public.blunder_dna_drills
    WHERE lichess_user_id = ${userId}
  `) as Array<{ lichess_game_id: string; ply: number; pattern_tag: PatternTag; eval_before: number; eval_after: number }>
  
  console.log(`[Blunder DNA] Loaded ${drillRows.length} drill rows`)
  
  // Group drills by pattern to compute phase, example games, and avg centipawn loss
  const patternMap = new Map<string, { theme: BlunderTheme; phase: GamePhase; count: number; avgCentipawnLoss: number; exampleGameIds: string[] }>()
  
  for (const pattern of patterns) {
    const theme = patternTagToTheme(pattern.patternTag)
    // Find drills for this pattern to determine phase distribution
    const patternDrills = drillRows.filter(d => d.pattern_tag === pattern.patternTag)
    const phases = patternDrills.map(d => getPhaseFromPly(d.ply))
    // Use most common phase, or default to opening
    const phaseCounts = new Map<GamePhase, number>()
    for (const phase of phases) {
      phaseCounts.set(phase, (phaseCounts.get(phase) || 0) + 1)
    }
    const mostCommonPhase = Array.from(phaseCounts.entries())
      .sort((a, b) => b[1] - a[1])[0]?.[0] || GamePhase.OPENING
    
    // Get example game IDs (up to 3 unique)
    const exampleGameIds = Array.from(new Set(patternDrills.map(d => d.lichess_game_id))).slice(0, 3)
    
    // Calculate actual average centipawn loss from drills
    const centipawnLosses = patternDrills.map(d => {
      const delta = d.eval_after - d.eval_before
      return Math.abs(delta)
    })
    const avgCentipawnLoss = centipawnLosses.length > 0
      ? Math.round((centipawnLosses.reduce((a, b) => a + b, 0) / centipawnLosses.length) * 100) / 100
      : 0
    
    patternMap.set(pattern.patternTag, {
      theme,
      phase: mostCommonPhase,
      count: pattern.occurrences,
      avgCentipawnLoss,
      exampleGameIds
    })
  }
  
  // Convert to BlunderPattern[]
  const blunderPatterns: BlunderPattern[] = Array.from(patternMap.values())
  
  console.log(`[Blunder DNA] Computed snapshot: ${gamesAnalyzed} games, ${blundersTotal} blunders, ${blunderPatterns.length} patterns`)
  
  // Create snapshot
  const snapshot: BlunderDnaSnapshot = {
    userId,
    snapshotDate: new Date().toISOString().slice(0, 10),
    gamesAnalyzed,
    blundersTotal,
    patterns: blunderPatterns,
    computedAt: new Date().toISOString(),
  }
  
  // Store snapshot
  await storeBlunderDnaSnapshot(snapshot)
  console.log(`[Blunder DNA] Stored snapshot: ${snapshot.gamesAnalyzed} games, ${snapshot.blundersTotal} blunders, date=${snapshot.snapshotDate}`)
  
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
    const userId = request.cookies.get('lichess_user_id')?.value ?? null
    if (!userId) {
      return NextResponse.json({ ok: false, error: 'Authentication required' }, { status: 403 })
    }
    await requireFeatureForUser('blunder_dna', { userId })
    
    // Check for force refresh
    const url = new URL(request.url)
    const forceRefresh = url.searchParams.get('force') === '1'
    
    // Get existing snapshot
    const existing = await getLatestBlunderDnaSnapshot(userId)
    
    // If force refresh, skip validation check
    if (forceRefresh) {
      console.log(`[Blunder DNA] Force refresh requested, computing new snapshot`)
      const snapshot = await computeSnapshot(userId)
      return NextResponse.json({
        ok: true,
        snapshot,
      })
    }
    
    // Check if existing snapshot is valid (within TTL)
    if (existing && isSnapshotValid(existing)) {
      console.log(`[Blunder DNA] Returning cached snapshot: ${existing.gamesAnalyzed} games, ${existing.blundersTotal} blunders`)
      return NextResponse.json({
        ok: true,
        snapshot: existing,
      })
    }
    
    // Compute new snapshot (either no existing or expired)
    console.log(`[Blunder DNA] Computing new snapshot (existing: ${existing ? 'expired' : 'none'})`)
    const snapshot = await computeSnapshot(userId)
    
    return NextResponse.json({
      ok: true,
      snapshot,
    })
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 403 })
    }
    console.error('[Blunder DNA] GET failed:', error)
    return NextResponse.json(
      { ok: false, error: error.message || 'Failed to get Blunder DNA' },
      { status: 500 }
    )
  }
}
