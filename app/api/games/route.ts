import { NextResponse } from 'next/server'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { getGames } from '@/lib/models'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (!isDbConfigured()) {
    return NextResponse.json({ games: [] })
  }
  try {
    await connectToDb()
    const games = await getGames(100)
    return NextResponse.json({ games })
  } catch (error: any) {
    console.error('Error fetching games:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to fetch games' },
      { status: 500 }
    )
  }
}
