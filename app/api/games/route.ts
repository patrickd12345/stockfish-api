import { NextResponse, NextRequest } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getGames, searchGames, getGamesByOpeningOutcome, getGamesByOpeningOutcomeCount } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ games: [] })
  }
  try {
    await connectToDb()
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')
    const opening = searchParams.get('opening')
    const outcome = searchParams.get('outcome')
    const limit = Number(searchParams.get('limit') ?? 500)

    let games
    let totalCount: number | null = null
    if (opening && outcome) {
      games = await getGamesByOpeningOutcome(opening, outcome, limit)
      totalCount = await getGamesByOpeningOutcomeCount(opening, outcome)
    } else if (query) {
      games = await searchGames(query)
    } else {
      // Show more than 100 so newest imports don't push "today" off the list.
      games = await getGames(500)
    }
    
    return NextResponse.json({ games, totalCount })
  } catch (error: any) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
