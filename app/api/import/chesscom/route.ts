import { NextRequest, NextResponse } from 'next/server'
import path from 'path'
import { fetchChessComArchives, fetchGamesFromArchive } from '@/lib/chesscom'
import { analyzePgn, parsePgnWithoutEngine } from '@/lib/analysis'
import { connectToDb, isDbConfigured } from '@/lib/database'
import { createGame, gameExists, gameExistsByPgnText } from '@/lib/models'
import { runBatchAnalysis } from '@/lib/batchAnalysis'
import { analyzeGameWithEngine } from '@/lib/engineAnalysis'
import { storeEngineAnalysis } from '@/lib/engineStorage'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function parseArchiveYearMonth(url: string): { year: number; month: number } | null {
  // Expected: https://api.chess.com/pub/player/<user>/games/YYYY/MM
  const m = url.match(/\/games\/(\d{4})\/(\d{2})\/?$/)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  if (!Number.isFinite(year) || !Number.isFinite(month)) return null
  if (month < 1 || month > 12) return null
  return { year, month }
}

function sortArchives(archives: string[]): string[] {
  // Chess.com does not guarantee order; sort chronologically.
  return [...archives].sort((a, b) => {
    const am = parseArchiveYearMonth(a)
    const bm = parseArchiveYearMonth(b)
    if (!am && !bm) return a.localeCompare(b)
    if (!am) return -1
    if (!bm) return 1
    return am.year !== bm.year ? am.year - bm.year : am.month - bm.month
  })
}

function getCurrentMonthArchiveUrl(username: string, now = new Date()): string {
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `https://api.chess.com/pub/player/${username}/games/${year}/${month}`
}

function getChessComGameEndTime(raw: any): number {
  const end = Number(raw?.end_time)
  if (Number.isFinite(end)) return end
  const start = Number(raw?.start_time)
  if (Number.isFinite(start)) return start
  return 0
}

export async function POST(request: NextRequest) {
  try {
    let body: any = null
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const {
      username,
      mode,
      cursor: cursorRaw,
      maxArchives: maxArchivesRaw,
      runBatch: runBatchRaw,
    } = body ?? {}
    const analysisMode = process.env.ENGINE_ANALYSIS_MODE || 'offline'

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    const dbConfigured = isDbConfigured()
    if (dbConfigured) {
      await connectToDb()
    }

    const normalizedMode = mode === 'all' ? 'all' : 'recent'
    const cursor = Number.isFinite(Number(cursorRaw)) ? Math.max(0, Number(cursorRaw)) : 0
    const maxArchives = Number.isFinite(Number(maxArchivesRaw)) ? Math.max(1, Number(maxArchivesRaw)) : 6
    const runBatch = runBatchRaw === true

    console.log(`Fetching archives for ${username} (${normalizedMode})...`)
    const archives = await fetchChessComArchives(username)

    let archivesToProcess = sortArchives(archives)
    if (normalizedMode === 'recent') {
      const recentFromArchives = archivesToProcess.slice(-3)
      const currentMonthUrl = getCurrentMonthArchiveUrl(username)
      archivesToProcess = Array.from(new Set([...recentFromArchives, currentMonthUrl]))
    }

    if (archivesToProcess.length === 0) {
      return NextResponse.json({ count: 0, message: 'No archives found' })
    }

    const sliceStart = normalizedMode === 'all' ? cursor : 0
    const sliceEnd =
      normalizedMode === 'all' ? Math.min(archivesToProcess.length, sliceStart + maxArchives) : archivesToProcess.length
    const archiveChunk = archivesToProcess.slice(sliceStart, sliceEnd)

    console.log(
      `Fetching games for ${username} (${normalizedMode}) from ${archiveChunk.length} archive(s) (cursor ${sliceStart}…${sliceEnd - 1})...`
    )

    const rawGames: any[] = []
    for (const url of archiveChunk) {
      try {
        const games = await fetchGamesFromArchive(url)
        rawGames.push(...games)
      } catch (e) {
        console.error('Failed to fetch archive:', url, e)
      }
    }

    if (rawGames.length === 0) {
      const done = normalizedMode !== 'all' || sliceEnd >= archivesToProcess.length
      return NextResponse.json({
        count: 0,
        saved: 0,
        totalFound: 0,
        archivesTotal: archivesToProcess.length,
        archivesProcessed: sliceEnd,
        nextCursor: done ? null : sliceEnd,
        done,
        message: 'No games found in fetched archives',
      })
    }

    let savedCount = 0
    let processedCount = 0
    const newlySaved: Array<{ id: string; pgnText: string }> = []

    // Chess.com game arrays are not guaranteed to be ordered oldest→newest.
    // Always process the most recent games first.
    const sortedGames = [...rawGames]
      .filter((g: any) => !!g?.pgn)
      .sort((a: any, b: any) => getChessComGameEndTime(b) - getChessComGameEndTime(a))

    // Hard-cap to protect serverless limits while still allowing large archives.
    const maxGamesToProcess = 20000
    const gamesToProcess = sortedGames.slice(0, maxGamesToProcess)

    for (const game of gamesToProcess) {
      if (!game.pgn) continue

      try {
        // Big speedup for large imports: if PGN already exists, skip parsing.
        if (dbConfigured) {
          const existsByPgn = await gameExistsByPgnText(String(game.pgn))
          if (existsByPgn) {
            processedCount++
            continue
          }
        }

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
                    const id = await createGame({
                ...entry.game,
                moves: entry.moves,
              })
                    newlySaved.push({ id, pgnText: entry.game.pgn_text })
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
    const done = normalizedMode !== 'all' || sliceEnd >= archivesToProcess.length
    if (savedCount > 0 && done && runBatch) {
      // Immediately analyze a few newly-imported games with Stockfish so blunders/mistakes/etc are real.
      const analyzeNow = process.env.ENGINE_ANALYZE_AFTER_IMPORT !== 'false'
      if (analyzeNow && newlySaved.length > 0) {
        const envPlayerNames =
          process.env.CHESS_PLAYER_NAMES?.split(',').map(s => s.trim()).filter(Boolean) ?? []
        const playerNames = Array.from(new Set([username, ...envPlayerNames].filter(Boolean)))
        const depth = Math.max(8, Math.min(25, Number(process.env.ANALYSIS_DEPTH ?? 15)))
        const stockfishPathResolved =
          process.env.STOCKFISH_PATH?.trim() ||
          (process.platform === 'win32'
            ? path.join(process.cwd(), 'stockfish.exe')
            : path.join(process.cwd(), 'stockfish'))
        const maxToAnalyze = Math.min(5, newlySaved.length)

        for (let i = 0; i < maxToAnalyze; i++) {
          try {
            const result = await analyzeGameWithEngine(newlySaved[i].pgnText, stockfishPathResolved, playerNames, depth)
            await storeEngineAnalysis(newlySaved[i].id, result, 'stockfish')
          } catch (e) {
            console.warn('Immediate engine analysis failed:', e)
          }
        }
      }

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
      archivesTotal: archivesToProcess.length,
      archivesProcessed: sliceEnd,
      nextCursor: done ? null : sliceEnd,
      done,
      message: `Processed ${processedCount} games (saved ${savedCount}) out of ${rawGames.length} found in ${archiveChunk.length} archive(s). (Limited to ${gamesToProcess.length})${
        savedCount > 0 && done && runBatch ? ' - Progression analysis updated' : ''
      }`,
    })

  } catch (error: any) {
    console.error('Import error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to import games' },
      { status: 500 }
    )
  }
}
