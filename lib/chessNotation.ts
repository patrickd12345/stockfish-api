import { Chess } from 'chess.js'

/**
 * Converts a UCI move (e.g., "c2c5") to algebraic notation (e.g., "c5")
 * @param uciMove - The UCI move string (e.g., "c2c5" or "c7c5")
 * @param fen - The FEN position before the move
 * @returns The algebraic notation (SAN) of the move, or the original UCI if conversion fails
 */
export function uciToSan(uciMove: string, fen: string): string {
  if (!uciMove || uciMove.length < 4) return uciMove
  
  try {
    const chess = new Chess(fen)
    const from = uciMove.slice(0, 2)
    const to = uciMove.slice(2, 4)
    const promotion = uciMove.length >= 5 ? uciMove.slice(4, 5) : undefined
    
    const move = chess.move({ from, to, promotion: promotion as any })
    return move?.san || uciMove
  } catch {
    return uciMove
  }
}

/**
 * Converts a sequence of UCI moves to algebraic notation
 * @param uciMoves - Space-separated UCI moves (e.g., "c2c5 e7e5")
 * @param fen - The starting FEN position
 * @param maxMoves - Maximum number of moves to convert (default: all)
 * @returns Space-separated algebraic notation moves
 */
export function uciSequenceToSan(uciMoves: string, fen: string, maxMoves?: number): string {
  if (!uciMoves) return ''
  
  const tokens = uciMoves.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return ''
  
  const limit = maxMoves ? Math.min(tokens.length, maxMoves) : tokens.length
  const sans: string[] = []
  const chess = new Chess(fen)
  
  for (let i = 0; i < limit; i++) {
    const token = tokens[i]
    if (token.length < 4) {
      sans.push(token)
      continue
    }
    
    try {
      const from = token.slice(0, 2)
      const to = token.slice(2, 4)
      const promotion = token.length >= 5 ? token.slice(4, 5) : undefined
      
      const move = chess.move({ from, to, promotion: promotion as any })
      if (move?.san) {
        sans.push(move.san)
      } else {
        sans.push(token)
      }
    } catch {
      sans.push(token)
    }
  }
  
  return sans.join(' ')
}

