import { NextResponse, NextRequest } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import {
  getGames,
  searchGames,
  getGamesByOpeningOutcome,
  getGamesByOpeningOutcomeCount,
  getLichessGameSummaries,
  searchLichessGameSummaries,
} from '@/lib/models'

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
      const [dbGames, lichessGames] = await Promise.all([
        searchGames(query),
        // Keep lichess results smaller so it doesn't drown out DB games.
        searchLichessGameSummaries(query, 80),
      ])
      games = [...lichessGames, ...dbGames]
    } else {
      // Show more than 100 so newest imports don't push "today" off the list.
      const [dbGames, lichessGames] = await Promise.all([
        getGames(500),
        getLichessGameSummaries(120),
      ])
      games = [...lichessGames, ...dbGames]
    }
    
    const normalizedGames = Array.isArray(games)
      ? games.map((game: any) => ({
          ...game,
          opening_name: game.opening_name ?? game.opening ?? undefined,
        }))
      : []

    // Best-effort sort so lichess live games interleave sensibly with imported games.
    normalizedGames.sort((a: any, b: any) => {
      const aDate = a?.createdAt ? new Date(a.createdAt).getTime() : 0
      const bDate = b?.createdAt ? new Date(b.createdAt).getTime() : 0
      return bDate - aDate
    })

    return NextResponse.json({ games: normalizedGames, totalCount })
  } catch (error: any) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
