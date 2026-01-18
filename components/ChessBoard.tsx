'use client'

import { useEffect, useMemo, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'

interface ChessBoardProps {
  fen?: string
  svg?: string
  size?: number | string
}

const DEFAULT_BOARD_WIDTH = 400

const buildGame = (fen?: string) => {
  if (!fen || fen === 'start') {
    return new Chess()
  }
  return new Chess(fen)
}

export default function ChessBoard({ fen, svg, size }: ChessBoardProps) {
  const [game, setGame] = useState(() => buildGame(fen))
  const [position, setPosition] = useState(game.fen())

  useEffect(() => {
    if (!fen) {
      return
    }
    const nextGame = buildGame(fen)
    setGame(nextGame)
    setPosition(nextGame.fen())
  }, [fen])

  const boardWidth = useMemo(() => {
    if (typeof size === 'number') {
      return size
    }
    if (typeof size === 'string') {
      const parsed = Number.parseInt(size, 10)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
    return DEFAULT_BOARD_WIDTH
  }, [size])

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    const nextGame = new Chess(game.fen())
    const move = nextGame.move({
      from: sourceSquare,
      to: targetSquare,
      promotion: 'q',
    })
    if (!move) {
      return false
    }
    setGame(nextGame)
    setPosition(nextGame.fen())
    return true
  }

  if (svg) {
    return (
      <div
        data-testid="chessboard-svg"
        style={{
          maxWidth: size || '400px',
          width: '100%',
          margin: '0 auto',
        }}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  return (
    <div
      data-testid="chessboard-interactive"
      style={{ maxWidth: size || '400px', width: '100%', margin: '0 auto' }}
    >
      <Chessboard
        position={position}
        boardWidth={boardWidth}
        areArrowsAllowed
        arePiecesDraggable
        onPieceDrop={handlePieceDrop}
      />
    </div>
  )
}
