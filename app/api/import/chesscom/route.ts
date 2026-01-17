import { NextRequest, NextResponse } from 'next/server'
import { fetchPlayerGames } from '@/lib/chesscom'
import { analyzePgn } from '@/lib/analysis'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { createGame, gameExists } from '@/lib/models'

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    const { username, mode } = await request.json()

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const dbConfigured = isDbConfigured()
    if (dbConfigured) {
      await connectToDb()
    }

    console.log(`Fetching games for ${username} (${mode})...`)
    const rawGames = await fetchPlayerGames(username, mode === 'all' ? 'all' : 'recent')
    
    if (rawGames.length === 0) {
      return NextResponse.json({ count: 0, message: 'No games found' })
    }

    let savedCount = 0
    let processedCount = 0

    // Limit to 100 games
    const gamesToProcess = rawGames.slice(-100) 

    for (const game of gamesToProcess) {
      if (!game.pgn) continue

      try {
        const analyzed = await analyzePgn(game.pgn, './stockfish', username)
        
        if (analyzed && analyzed.length > 0 && dbConfigured) {
          for (const entry of analyzed) {
            const exists = await gameExists(entry.game.date, entry.game.white, entry.game.black)
            if (!exists) {
              await createGame({
                ...entry.game,
                moves: entry.moves,
              })
              savedCount++
            }
          }
        }
        processedCount++
      } catch (e) {
        console.error('Failed to process game:', e)
      }
    }

    return NextResponse.json({
      count: processedCount,
      saved: savedCount,
      totalFound: rawGames.length,
      message: `Processed ${processedCount} games (saved ${savedCount}) out of ${rawGames.length} found. (Limited to last 100)`
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import games' },
      { status: 500 }
    )
  }
}
