import { Chess } from 'chess.js'

const DEFAULT_BOARD_SIZE = 400

export async function renderBoard(fen: string, size: number = DEFAULT_BOARD_SIZE): Promise<string> {
  const chess = new Chess(fen)
  
  // Generate SVG board
  const squareSize = size / 8
  let svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`
  
  // Draw board squares
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLight = (rank + file) % 2 === 0
      const x = file * squareSize
      const y = rank * squareSize
      svg += `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${isLight ? '#f0d9b5' : '#b58863'}"/>`
    }
  }

  // Draw pieces
  const board = chess.board()
  const pieceChars: { [key: string]: string } = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
  }

  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      if (piece) {
        const x = file * squareSize + squareSize / 2
        const y = rank * squareSize + squareSize / 2
        const pieceKey = `${piece.color}${piece.type.toUpperCase()}`
        const pieceChar = pieceChars[pieceKey] || ''
        const textColor = piece.color === 'w' ? '#fff' : '#000'
        svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${squareSize * 0.6}" fill="${textColor}" font-family="Arial, sans-serif">${pieceChar}</text>`
      }
    }
  }

  svg += '</svg>'
  return svg
}
