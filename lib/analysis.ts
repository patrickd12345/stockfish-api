import { Chess } from 'chess.js'
import { resolveStockfishPath, StockfishEngine } from '@/lib/stockfish'

const BLUNDER_THRESHOLD = 200
const DEFAULT_MOVE_TIME_MS = 100

export interface GameData {
  game: {
    date?: string
    white?: string
    black?: string
    result?: string
    opening_name?: string
    my_accuracy?: number
    blunders: number
    pgn_text: string
  }
  moves: Array<{
    move_number: number
    ply: number
    fen: string
    move_san: string
    engine_eval?: number
    is_blunder: boolean
  }>
}

export async function analyzePgn(
  pgnText: string,
  stockfishPath: string,
  username: string
): Promise<GameData[]> {
  if (!pgnText.trim()) {
    return []
  }

  try {
    const enginePath = resolveStockfishPath(stockfishPath)
    const moveTimeMs = parseInt(
      process.env.STOCKFISH_TIME_LIMIT_MS || '',
      10
    ) || DEFAULT_MOVE_TIME_MS
    const engine = new StockfishEngine(enginePath, moveTimeMs)
    await engine.start()

    const gameStrings = pgnText.split(/(\[Event\s+"[^"]+"\])/g).filter(s => s.trim())
    const results: GameData[] = []
    
    const games: string[] = []
    for (let i = 0; i < gameStrings.length; i++) {
      if (gameStrings[i].startsWith('[Event')) {
        games.push(gameStrings[i] + (gameStrings[i+1] || ''))
        i++
      } else {
        games.push(gameStrings[i])
      }
    }

    try {
      for (const gamePgn of games) {
        const chess = new Chess()
        try {
          chess.loadPgn(gamePgn)
        } catch (e) {
          console.warn('Failed to load PGN:', e)
          continue
        }

        const history = chess.history({ verbose: true })
        const moves: GameData['moves'] = []
        const losses: number[] = []
        let blunders = 0
        
        const tempChess = new Chess()
        let ply = 0

        const headers = chess.header()
        const normalizedUsername = username.trim().toLowerCase()
        const isWhite = headers.White?.toLowerCase() === normalizedUsername
        const isBlack = headers.Black?.toLowerCase() === normalizedUsername
        const userColor = isWhite ? 'white' : isBlack ? 'black' : null

        for (const move of history) {
          try {
            const isUserMove = userColor
              ? (userColor === 'white' && ply % 2 === 0) ||
                (userColor === 'black' && ply % 2 === 1)
              : false

            let engineEval: number | undefined
            let isBlunder = false

            if (isUserMove) {
              const evalBefore = await engine.evaluate(
                tempChess.fen(),
                tempChess.turn()
              )
              tempChess.move(move.san)
              const evalAfter = await engine.evaluate(
                tempChess.fen(),
                tempChess.turn()
              )
              engineEval = evalAfter
              const loss = centipawnLoss(evalBefore, evalAfter, userColor)
              losses.push(loss)
              if (loss > BLUNDER_THRESHOLD) {
                isBlunder = true
                blunders++
              }
            } else {
              tempChess.move(move.san)
            }

            ply++
            const moveNumber = Math.ceil(ply / 2)

            moves.push({
              move_number: moveNumber,
              ply,
              fen: tempChess.fen(),
              move_san: move.san,
              engine_eval: engineEval,
              is_blunder: isBlunder,
            })
          } catch (e) {
            console.warn('Failed move in game:', e)
          }
        }

        const accuracy = accuracyFromLosses(losses)

        results.push({
          game: {
            date: headers.Date ?? undefined,
            white: headers.White ?? undefined,
            black: headers.Black ?? undefined,
            result: headers.Result ?? undefined,
            opening_name: headers.Opening ?? undefined,
            my_accuracy: accuracy,
            blunders,
            pgn_text: gamePgn,
          },
          moves,
        })
      }
    } finally {
      await engine.stop()
    }

    return results
  } catch (error) {
    console.error('Error analyzing PGN:', error)
    throw new Error('Failed to analyze PGN: ' + (error as Error).message)
  }
}

export async function parsePgnWithoutEngine(pgnText: string): Promise<GameData[]> {
  if (!pgnText.trim()) {
    return []
  }

  const gameStrings = pgnText.split(/(\[Event\s+"[^"]+"\])/g).filter(s => s.trim())
  const results: GameData[] = []

  const games: string[] = []
  for (let i = 0; i < gameStrings.length; i++) {
    if (gameStrings[i].startsWith('[Event')) {
      games.push(gameStrings[i] + (gameStrings[i + 1] || ''))
      i++
    } else {
      games.push(gameStrings[i])
    }
  }

  for (const gamePgn of games) {
    const chess = new Chess()
    try {
      chess.loadPgn(gamePgn)
    } catch (e) {
      console.warn('Failed to load PGN:', e)
      continue
    }

    const history = chess.history({ verbose: true })
    const moves: GameData['moves'] = []
    const tempChess = new Chess()
    let ply = 0

    for (const move of history) {
      try {
        tempChess.move(move.san)
        ply++
        const moveNumber = Math.ceil(ply / 2)
        moves.push({
          move_number: moveNumber,
          ply,
          fen: tempChess.fen(),
          move_san: move.san,
          engine_eval: undefined,
          is_blunder: false,
        })
      } catch (e) {
        console.warn('Failed move in game:', e)
      }
    }

    const headers = chess.header()

    results.push({
      game: {
        date: headers.Date ?? undefined,
        white: headers.White ?? undefined,
        black: headers.Black ?? undefined,
        result: headers.Result ?? undefined,
        opening_name: headers.Opening ?? undefined,
        my_accuracy: undefined,
        // IMPORTANT: We have no engine evaluation here, so blunders are UNKNOWN.
        // Use a sentinel value to avoid lying with "0".
        blunders: -1,
        pgn_text: gamePgn,
      },
      moves,
    })
  }

  return results
}

function centipawnLoss(
  beforeCp: number,
  afterCp: number,
  myColor: 'white' | 'black' | null
): number {
  if (!myColor) return 0
  const beforePov = myColor === 'white' ? beforeCp : -beforeCp
  const afterPov = myColor === 'white' ? afterCp : -afterCp
  const loss = beforePov - afterPov
  return Math.max(0, Math.round(loss))
}

function accuracyFromLosses(losses: number[]): number | undefined {
  if (losses.length === 0) return undefined
  const avgLoss = losses.reduce((sum, loss) => sum + loss, 0) / losses.length
  const accuracy = 100 - avgLoss / 2
  return Math.max(0, Math.min(100, accuracy))
}
