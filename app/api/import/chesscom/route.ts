import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { fetchPlayerGames } from '@/lib/chesscom'
import { analyzePgn, parsePgnWithoutEngine } from '@/lib/analysis'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { createGame, gameExists, gameExistsByPgnText } from '@/lib/models'
import { runBatchAnalysis } from '@/lib/batchAnalysis'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function getChessComGameEndTime(raw: any): number {
  const end = Number(raw?.end_time)
  if (Number.isFinite(end)) return end
  const start = Number(raw?.start_time)
  if (Number.isFinite(start)) return start
  return 0
}

export async function POST(request: NextRequest) {
  try {
    const { username, mode } = await request.json()
    const analysisMode = process.env.ENGINE_ANALYSIS_MODE || 'offline'

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

    // Chess.com game arrays are not guaranteed to be ordered oldest→newest.
    // Always process the most recent games first.
    const sortedGames = [...rawGames]
      .filter((g: any) => !!g?.pgn)
      .sort((a: any, b: any) => getChessComGameEndTime(b) - getChessComGameEndTime(a))

    // Hard-cap so imports stay within serverless limits.
    // Recent runs every startup, so keep it moderately sized.
    const maxGamesToProcess = mode === 'all' ? 100 : 250
    const gamesToProcess = sortedGames.slice(0, maxGamesToProcess)

    for (const game of gamesToProcess) {
      if (!game.pgn) continue

      try {
        // Use an absolute path so runtime CWD differences don't break Stockfish in dev/serverless.
        const defaultStockfishPath =
          process.platform === 'win32'
            ? path.join(process.cwd(), 'stockfish.exe')
            : path.join(process.cwd(), 'stockfish')
        const analyzed =
          analysisMode === 'inline'
            ? await analyzePgn(game.pgn, defaultStockfishPath, username)
            : await parsePgnWithoutEngine(game.pgn)
        
        if (analyzed && analyzed.length > 0 && dbConfigured) {
          for (const entry of analyzed) {
            // Dedup by PGN text first (date+players is not unique; multiple games can be played
            // between the same players on the same date).
            const pgnText = String(entry?.game?.pgn_text ?? '')
            const exists = pgnText
              ? await gameExistsByPgnText(pgnText)
              : await gameExists(entry.game.date, entry.game.white, entry.game.black)
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

    // Trigger batch analysis if any games were saved
    if (savedCount > 0) {
      console.log('🔄 Triggering batch analysis after Chess.com import...')
      try {
        await runBatchAnalysis()
        console.log('✅ Batch analysis completed')
      } catch (batchError) {
        console.error('❌ Batch analysis failed:', batchError)
        // Don't fail the entire request if batch analysis fails
      }
    }

    return NextResponse.json({
      count: processedCount,
      saved: savedCount,
      totalFound: rawGames.length,
      message: `Processed ${processedCount} games (saved ${savedCount}) out of ${rawGames.length} found. (Limited to ${gamesToProcess.length})${savedCount > 0 ? ' - Progression analysis updated' : ''}`
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import games' },
      { status: 500 }
    )
  }
}
