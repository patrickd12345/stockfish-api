import { Chess } from 'chess.js'

export function deriveFenFromMoves(moves: string, initialFen?: string): string {
  const chess = new Chess(initialFen)
  if (!moves.trim()) {
    return chess.fen()
  }
  const moveList = moves.trim().split(/\s+/)
  for (const move of moveList) {
    const result = chess.move(move, { strict: false })
    if (!result) {
      throw new Error(`Invalid move sequence: ${move}`)
    }
  }
  return chess.fen()
}
