import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { fetchRecentLichessGames, persistInputGames } from '@/lib/blunderDna'
import { executeServerSideAnalysis } from '@/lib/engineGateway'
import { FeatureAccessError, requireFeatureForUser } from '@/lib/featureGate/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    console.error('[Blunder DNA] Missing lichess_user_id cookie')
    return NextResponse.json({ error: 'Unauthorized: Please connect your Lichess account' }, { status: 401 })
  }
  if (!isDbConfigured()) {
    console.error('[Blunder DNA] Database not configured')
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  try {
    await requireFeatureForUser('blunder_dna', { userId: lichessUserId })
    
    const body = await request.json().catch(() => ({}))
    const n = typeof body.n === 'number' ? body.n : 50
    console.log(`[Blunder DNA] Starting analysis for ${lichessUserId}, fetching ${n} games`)
    
    const games = await fetchRecentLichessGames(lichessUserId, n)
    console.log(`[Blunder DNA] Fetched ${games.length} games from Lichess`)
    
    if (games.length === 0) {
      return NextResponse.json({ 
        error: 'No games found. Make sure you have played games on Lichess and they are accessible.',
        gamesAnalyzed: 0 
      }, { status: 400 })
    }
    
    await persistInputGames(lichessUserId, games)
    console.log(`[Blunder DNA] Persisted ${games.length} games to database`)
    
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
      console.error(`[Blunder DNA] Analysis failed: ${result.error}`)
      return NextResponse.json(
        { error: result.error || 'Analysis failed' },
        { status: result.error?.includes('Budget') ? 429 : 500 }
      )
    }
    
    console.log(`[Blunder DNA] Analysis completed: ${result.result?.patterns?.length || 0} patterns, ${result.result?.drills?.length || 0} drills`)
    
    return NextResponse.json({
      ok: true,
      gamesAnalyzed: games.length,
      patterns: result.result?.patterns || [],
      drills: result.result?.drills || [],
      budgetRemaining: result.budgetRemaining,
    })
  } catch (error: any) {
    if (error instanceof FeatureAccessError) {
      console.error(`[Blunder DNA] Feature access denied: ${error.message}`)
      return NextResponse.json({ error: error.message }, { status: 403 })
    }
    console.error('[Blunder DNA] analyze failed:', error)
    const errorMessage = error?.message || 'Analysis failed'
    // Provide more helpful error messages
    if (errorMessage.includes('Missing Lichess token')) {
      return NextResponse.json({ 
        error: 'Please connect your Lichess account first. Go to the Lichess Live tab and click "Connect Lichess".' 
      }, { status: 401 })
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

