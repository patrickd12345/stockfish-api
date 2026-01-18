import { NextResponse, NextRequest } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getGames, searchGames } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  if (!isDbConfigured()) {
    return NextResponse.json({ games: [] })
  }
  try {
    await connectToDb()
    const { searchParams } = new URL(req.url)
    const query = searchParams.get('q')

    let games
    if (query) {
      games = await searchGames(query)
    } else {
      games = await getGames(100)
    }
    
    return NextResponse.json({ games })
  } catch (error: any) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
