import { NextRequest, NextResponse } from 'next/server'
import { isDbConfigured } from '@/lib/database'
import { fetchRecentLichessGames, persistInputGames, analyzeBlunderDnaFromGames } from '@/lib/blunderDna'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isDbConfigured()) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  try {
    const body = await request.json().catch(() => ({}))
    const n = typeof body.n === 'number' ? body.n : 50
    const games = await fetchRecentLichessGames(lichessUserId, n)
    await persistInputGames(lichessUserId, games)
    const result = await analyzeBlunderDnaFromGames({ lichessUserId, games, depth: 10, thresholdCp: 150, nPerPattern: 3 })
    return NextResponse.json({ ok: true, gamesAnalyzed: games.length, patterns: result.patterns, drills: result.drills })
  } catch (error: any) {
    console.error('[Blunder DNA] analyze failed:', error)
    return NextResponse.json({ error: error.message || 'Analysis failed' }, { status: 500 })
  }
}

