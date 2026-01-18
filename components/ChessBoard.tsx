'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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

const toCssSize = (size: number | string | undefined): string => {
  if (typeof size === 'number') {
    return `${size}px`
  }
  if (typeof size === 'string' && size.trim()) {
    return size
  }
  // Slight padding on mobile so the board never touches screen edges.
  return 'min(92vw, 400px)'
}

export default function ChessBoard({ fen, svg, size }: ChessBoardProps) {
  const [game, setGame] = useState(() => buildGame(fen))
  const [position, setPosition] = useState(game.fen())
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)

  useEffect(() => {
    if (!fen) {
      return
    }
    const nextGame = buildGame(fen)
    setGame(nextGame)
    setPosition(nextGame.fen())
  }, [fen])

  useEffect(() => {
    // Keep the board responsive on small screens.
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const el = containerRef.current
    if (!el) {
      return
    }

    const ro = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect?.width
      if (typeof next === 'number' && Number.isFinite(next) && next > 0) {
        setMeasuredWidth(Math.floor(next))
      }
    })

    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const boardWidth = useMemo(() => {
    let desired = DEFAULT_BOARD_WIDTH

    if (typeof size === 'number') {
      desired = size
    } else if (typeof size === 'string') {
      const parsed = Number.parseInt(size, 10)
      if (Number.isFinite(parsed)) {
        desired = parsed
      }
    }

    if (typeof measuredWidth === 'number' && Number.isFinite(measuredWidth)) {
      return Math.max(1, Math.min(measuredWidth, desired))
    }

    return desired
  }, [measuredWidth, size])

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    const nextGame = new Chess(game.fen())
    let move = null
    try {
      move = nextGame.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: 'q',
      })
    } catch {
      return false
    }
    if (!move) return false
    setGame(nextGame)
    setPosition(nextGame.fen())
    return true
  }

  const maxWidth = toCssSize(size)

  if (svg) {
    return (
      <div
        data-testid="chessboard-svg"
        style={{
          maxWidth,
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
      ref={containerRef}
      style={{ maxWidth, width: '100%', margin: '0 auto' }}
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
