import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured, connectToDb, getSql, isNeonQuotaError } from '@/lib/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/blunder-dna/game-drills?gameId={gameId}
 * 
 * Gets all drills for a specific Lichess game.
 * 
 * Used to display related drills in the post-game review UI and link
 * users to the Blunder DNA tab where they can practice drills from that game.
 * 
 * @see docs/POST_GAME_REVIEW_DRILLS.md for full documentation
 */
export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isDbConfigured()) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const gameId = request.nextUrl.searchParams.get('gameId')
  if (!gameId) {
    return NextResponse.json({ error: 'Missing gameId parameter' }, { status: 400 })
  }

  try {
    await connectToDb()
    const sql = getSql()

    const rows = (await sql`
      SELECT drill_id, lichess_game_id, ply, pattern_tag, difficulty, created_at
      FROM public.blunder_dna_drills
      WHERE lichess_user_id = ${lichessUserId} AND lichess_game_id = ${gameId}
      ORDER BY ply ASC, created_at DESC
    `) as Array<{
      drill_id: string
      lichess_game_id: string
      ply: number
      pattern_tag: string
      difficulty: number
      created_at: Date
    }>

    return NextResponse.json({
      drills: rows.map(r => ({
        drillId: r.drill_id,
        ply: r.ply,
        patternTag: r.pattern_tag,
        difficulty: r.difficulty,
        createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at)
      }))
    })
  } catch (error: any) {
    if (isNeonQuotaError(error)) {
      return NextResponse.json(
        {
          error: 'Database data transfer quota exceeded. Upgrade your database plan or try again later.',
          quotaExceeded: true,
        },
        { status: 503 }
      )
    }
    console.error('[Get Game Drills] Failed:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to get drills' },
      { status: 500 }
    )
  }
}
