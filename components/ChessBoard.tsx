'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'

interface ChessBoardProps {
  fen?: string
  svg?: string
  size?: number | string
  theme?: 'default' | 'wood'
}

const DEFAULT_BOARD_WIDTH = 400

const buildGame = (fen?: string) => {
  if (!fen || fen === 'start') {
    return new Chess()
  }
  return new Chess(fen)
}

const WOOD_LIGHT = '#e7c9a2'
const WOOD_DARK = '#b07a4a'

const getThemeStyles = (theme: ChessBoardProps['theme']) => {
  if (theme !== 'wood') {
    return {}
  }

  return {
    customLightSquareStyle: { backgroundColor: WOOD_LIGHT },
    customDarkSquareStyle: { backgroundColor: WOOD_DARK },
    customBoardStyle: {
      borderRadius: '14px',
      boxShadow: '0 12px 24px rgba(60, 36, 14, 0.35)',
      border: '8px solid rgba(90, 56, 22, 0.6)',
    },
  }
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

export default function ChessBoard({ fen, svg, size, theme = 'default' }: ChessBoardProps) {
  const [game, setGame] = useState(() => buildGame(fen))
  const [position, setPosition] = useState(game.fen())
  const containerRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState<number | null>(null)
  const themeStyles = useMemo(() => getThemeStyles(theme), [theme])

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
    let usesRelativeSize = false

    if (typeof size === 'number') {
      desired = size
    } else if (typeof size === 'string') {
      const trimmed = size.trim()
      if (/^\d+$/.test(trimmed)) {
        desired = Number.parseInt(trimmed, 10)
      } else if (/^\d+px$/.test(trimmed)) {
        desired = Number.parseInt(trimmed.replace('px', ''), 10)
      } else {
        usesRelativeSize = true
      }
    }

    if (typeof measuredWidth === 'number' && Number.isFinite(measuredWidth)) {
      if (usesRelativeSize) {
        return Math.max(1, measuredWidth)
      }
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
        customLightSquareStyle={themeStyles.customLightSquareStyle}
        customDarkSquareStyle={themeStyles.customDarkSquareStyle}
        customBoardStyle={themeStyles.customBoardStyle}
      />
    </div>
  )
}
