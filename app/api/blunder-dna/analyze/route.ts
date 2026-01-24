import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { fetchRecentLichessGames, persistInputGames } from '@/lib/blunderDna'
import { executeServerSideAnalysis } from '@/lib/engineGateway'
import { requireProEntitlement, ForbiddenError } from '@/lib/entitlementGuard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    // Require Pro entitlement
    await requireProEntitlement(request)
    
    const body = await request.json().catch(() => ({}))
    const n = typeof body.n === 'number' ? body.n : 50
    const games = await fetchRecentLichessGames(lichessUserId, n)
    await persistInputGames(lichessUserId, games)
    
    // Use gateway to enforce entitlement and budget
    const result = await executeServerSideAnalysis({
      userId: lichessUserId,
      type: 'blunder-dna',
      lichessGames: games,
      depth: 10,
      thresholdCp: 150,
      nPerPattern: 3,
    })
    
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error || 'Analysis failed' },
        { status: result.error?.includes('Budget') ? 429 : 500 }
      )
    }
    
    return NextResponse.json({
      ok: true,
      gamesAnalyzed: games.length,
      patterns: result.result?.patterns || [],
      drills: result.result?.drills || [],
      budgetRemaining: result.budgetRemaining,
    })
  } catch (error: any) {
    if (error instanceof ForbiddenError) {
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[Blunder DNA] analyze failed:', error)
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 })
  }
}

