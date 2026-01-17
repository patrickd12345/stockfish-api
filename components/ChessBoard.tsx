'use client'

import { useEffect, useRef } from 'react'
import { Chess } from 'chess.js'

interface ChessBoardProps {
  fen?: string
  svg?: string
  size?: number | string
}

export default function ChessBoard({ fen, svg, size }: ChessBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (svg && containerRef.current) {
      containerRef.current.innerHTML = svg
    } else if (fen && containerRef.current) {
      // Use chess.js to render board
      const game = new Chess(fen)
      const boardSvg = generateBoardSvg(game)
      containerRef.current.innerHTML = boardSvg
    }
  }, [fen, svg])

  return (
    <div
      ref={containerRef}
      style={{
        maxWidth: size || '400px',
        width: '100%',
        margin: '0 auto',
      }}
    />
  )
}

function generateBoardSvg(game: Chess): string {
  // Simple SVG board representation
  // In production, you'd want to use a proper chess board library
  const size = 400
  const squareSize = size / 8
  let svg = `<svg width="100%" height="100%" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">`
  
  // Draw board squares
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const isLight = (rank + file) % 2 === 0
      const x = file * squareSize
      const y = (7 - rank) * squareSize
      svg += `<rect x="${x}" y="${y}" width="${squareSize}" height="${squareSize}" fill="${isLight ? '#f0d9b5' : '#b58863'}"/>`
    }
  }

  // Draw pieces (simplified - you'd want proper piece images)
  const board = game.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      if (piece) {
        const x = file * squareSize + squareSize / 2
        const y = (7 - rank) * squareSize + squareSize / 2
        const pieceChar = getPieceChar(piece)
        const textColor = piece.color === 'w' ? '#fff' : '#000'
        svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="middle" font-size="${squareSize * 0.6}" fill="${textColor}">${pieceChar}</text>`
      }
    }
  }

  svg += '</svg>'
  return svg
}

function getPieceChar(piece: { type: string; color: string }): string {
  const pieces: { [key: string]: string } = {
    'wK': '♔', 'wQ': '♕', 'wR': '♖', 'wB': '♗', 'wN': '♘', 'wP': '♙',
    'bK': '♚', 'bQ': '♛', 'bR': '♜', 'bB': '♝', 'bN': '♞', 'bP': '♟',
  }
  return pieces[`${piece.color}${piece.type.toUpperCase()}`] || ''
}
