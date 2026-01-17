import { Chess } from 'chess.js'

// For serverless deployment, we'll use a simplified analysis
// that doesn't require Stockfish locally
// You can integrate with a Stockfish API service if needed

const BLUNDER_THRESHOLD = 200

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

// Simple PGN parser
function parsePgn(pgnText: string): Array<{ headers: Record<string, string>, moves: string[] }> {
  const games: Array<{ headers: Record<string, string>, moves: string[] }> = []
  const lines = pgnText.split('\n')
  
  let currentGame: { headers: Record<string, string>, moves: string[] } | null = null
  let moveText = ''

  for (const line of lines) {
    const trimmed = line.trim()
    
    // Parse headers
    const headerMatch = trimmed.match(/^\[(\w+)\s+"([^"]+)"\]$/)
    if (headerMatch) {
      if (!currentGame) {
        currentGame = { headers: {}, moves: [] }
      }
      currentGame.headers[headerMatch[1]] = headerMatch[2]
      continue
    }

    // Parse moves
    if (trimmed && !trimmed.startsWith('[') && currentGame) {
      moveText += ' ' + trimmed
    }

    // End of game
    if (trimmed === '' && currentGame && moveText.trim()) {
      // Parse moves from move text
      const moveRegex = /\d+\.\s*([^\s]+(?:\s+[^\s]+)?)/g
      const moves: string[] = []
      let match
      while ((match = moveRegex.exec(moveText)) !== null) {
        const movePair = match[1].trim().split(/\s+/)
        moves.push(...movePair.filter(m => m && !m.match(/^0-1|1-0|1\/2-1\/2|\*$/)))
      }
      currentGame.moves = moves
      games.push(currentGame)
      currentGame = null
      moveText = ''
    }
  }

  // Handle last game if no blank line at end
  if (currentGame && moveText.trim()) {
    const moveRegex = /\d+\.\s*([^\s]+(?:\s+[^\s]+)?)/g
    const moves: string[] = []
    let match
    while ((match = moveRegex.exec(moveText)) !== null) {
      const movePair = match[1].trim().split(/\s+/)
      moves.push(...movePair.filter(m => m && !m.match(/^0-1|1-0|1\/2-1\/2|\*$/)))
    }
    currentGame.moves = moves
    games.push(currentGame)
  }

  return games
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
    const games = parsePgn(pgnText)
    const results: GameData[] = []

    for (const game of games) {
      const chess = new Chess()
      const moves: GameData['moves'] = []
      let blunders = 0
      let ply = 0

      // Identify user color
      const normalizedUsername = username.trim().toLowerCase()
      const isWhite = game.headers.White?.toLowerCase() === normalizedUsername
      const isBlack = game.headers.Black?.toLowerCase() === normalizedUsername
      const userColor = isWhite ? 'white' : isBlack ? 'black' : null

      for (const moveStr of game.moves) {
        try {
          const moveObj = chess.move(moveStr)
          if (!moveObj) continue

          ply++
          const moveNumber = Math.ceil(ply / 2)

          const isUserMove = userColor
            ? (userColor === 'white' && ply % 2 === 1) ||
              (userColor === 'black' && ply % 2 === 0)
            : false

          // Simplified analysis - in production, you'd call a Stockfish API
          // For now, we'll just track the moves without engine evaluation
          const isBlunder = false // Would be determined by Stockfish analysis

          moves.push({
            move_number: moveNumber,
            ply,
            fen: chess.fen(),
            move_san: moveObj.san,
            engine_eval: undefined,
            is_blunder: isBlunder,
          })

          if (isBlunder) {
            blunders++
          }
        } catch (e) {
          // Skip invalid moves
          console.warn('Invalid move:', moveStr, e)
        }
      }

      // Calculate accuracy (simplified)
      const userMoves = moves.filter((m) => m.is_blunder !== undefined)
      const accuracy = userMoves.length > 0
        ? Math.max(0, Math.min(100, 100 - (blunders / userMoves.length) * 10))
        : undefined

      // Reconstruct PGN
      const reconstructedPgn = formatPgn(game)

      results.push({
        game: {
          date: game.headers.Date,
          white: game.headers.White,
          black: game.headers.Black,
          result: game.headers.Result,
          opening_name: game.headers.Opening,
          my_accuracy: accuracy,
          blunders,
          pgn_text: reconstructedPgn,
        },
        moves,
      })
    }

    return results
  } catch (error) {
    console.error('Error analyzing PGN:', error)
    throw new Error('Failed to analyze PGN: ' + (error as Error).message)
  }
}

function formatPgn(game: { headers: Record<string, string>, moves: string[] }): string {
  let pgn = ''
  for (const [key, value] of Object.entries(game.headers)) {
    pgn += `[${key} "${value}"]\n`
  }
  pgn += '\n'
  pgn += game.moves.join(' ')
  return pgn
}
