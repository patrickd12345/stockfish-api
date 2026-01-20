import { Move } from 'chess.js'

const PIECE_NAMES: Record<string, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
}

export function moveToSpeech(move: Move): string {
  const color = move.color === 'w' ? 'White' : 'Black'
  const piece = PIECE_NAMES[move.piece] || 'Piece'

  let action = 'to'
  if (move.flags.includes('c') || move.flags.includes('e')) {
    action = 'captures on'
  }

  let text = `${color} ${piece} ${action} ${move.to}`

  if (move.flags.includes('k')) {
    text = `${color} Castles King side`
  } else if (move.flags.includes('q')) {
    text = `${color} Castles Queen side`
  }

  if (move.san.includes('#')) {
    text += ', Checkmate'
  } else if (move.san.includes('+')) {
    text += ', Check'
  }

  return text
}

export function getSquareCoordinates(square: string): { row: number; col: number } {
  const col = square.charCodeAt(0) - 'a'.charCodeAt(0) // 0-7
  const row = parseInt(square[1], 10) - 1 // 0-7
  return { row, col } // 0-7, 0-7. Note: row 0 is rank 1, row 7 is rank 8.
}

export function getSquareFromCoordinates(row: number, col: number): string | null {
  if (row < 0 || row > 7 || col < 0 || col > 7) return null
  const file = String.fromCharCode('a'.charCodeAt(0) + col)
  const rank = row + 1
  return `${file}${rank}`
}
