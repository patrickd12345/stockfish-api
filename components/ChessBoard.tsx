'use client'

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import { Chess, Move } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import { getSquareCoordinates, getSquareFromCoordinates, moveToSpeech } from '@/lib/accessibility'

interface ChessBoardProps {
  fen?: string
  svg?: string
  size?: number | string
  theme?: 'default' | 'wood'
  onMove?: (from: string, to: string) => void
  isDraggable?: boolean
  orientation?: 'white' | 'black'
  highlightSquares?: Record<string, CSSProperties>
}

const DEFAULT_BOARD_WIDTH = 400

const buildGame = (fen?: string) => {
  if (!fen || fen === 'start') {
    return new Chess()
  }
  return new Chess(fen)
}

const WOOD_LIGHT = '#d2b48c' // Tan / Light Wood
const WOOD_DARK = '#8b4513'  // SaddleBrown / Dark Wood

const isDarkSquare = (square: string): boolean => {
  // a1 is dark.
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0) // 0..7
  const rank = Number.parseInt(square[1] ?? '0', 10) // 1..8
  if (!Number.isFinite(file) || !Number.isFinite(rank)) return false
  return (file + rank) % 2 === 1
}

const getThemeStyles = (theme: ChessBoardProps['theme']) => {
  if (theme !== 'wood') {
    return {}
  }

  return {
    customLightSquareStyle: { 
      backgroundColor: WOOD_LIGHT,
      backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0) 100%)',
    },
    customDarkSquareStyle: { 
      backgroundColor: WOOD_DARK,
      backgroundImage: 'radial-gradient(circle, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0) 100%)',
    },
    customBoardStyle: {
      borderRadius: '8px',
      boxShadow: '0 20px 50px rgba(0,0,0,0.6), inset 0 0 50px rgba(0,0,0,0.3)',
      border: '12px solid #5d2906',
      background: '#5d2906',
    },
  }
}

// 3D Wooden Pieces Implementation
const CustomPiece = ({ isWhite, piece }: { isWhite: boolean, piece: string }) => {
  // We use the standard pieces but apply a 3D wooden filter
  // The filter adds depth (shadows) and a wooden hue
  const colorFilter = isWhite 
    ? 'sepia(0.6) saturate(1.2) brightness(1.1) contrast(1.1) drop-shadow(2px 4px 2px rgba(0,0,0,0.4))'
    : 'sepia(0.8) saturate(0.8) brightness(0.6) contrast(1.2) drop-shadow(2px 4px 2px rgba(0,0,0,0.6))'

  return (
    <div style={{ 
      width: '100%', 
      height: '100%', 
      filter: colorFilter,
      transition: 'transform 0.1s ease',
      cursor: 'grab'
    }}>
      {/* react-chessboard provides the piece image as children or we can just let it render its default and apply filter to the container */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img 
        src={`https://react-chessboard.com/static/media/${piece}.png`} 
        style={{ width: '100%', height: '100%' }}
        alt={piece}
      />
    </div>
  )
}

const customPieces = (theme: ChessBoardProps['theme']) => {
  if (theme !== 'wood') return undefined

  const pieces = ['wP', 'wN', 'wB', 'wR', 'wQ', 'wK', 'bP', 'bN', 'bB', 'bR', 'bQ', 'bK']
  const custom: any = {}
  
  pieces.forEach(p => {
    custom[p] = ({ squareWidth }: { squareWidth: number }) => (
      <div style={{ 
        width: squareWidth, 
        height: squareWidth, 
        filter: p.startsWith('w') 
          ? 'sepia(0.5) saturate(1.5) brightness(1.2) contrast(1.1) drop-shadow(0 4px 4px rgba(0,0,0,0.4))' 
          : 'sepia(0.7) saturate(0.5) brightness(0.5) contrast(1.3) drop-shadow(0 4px 4px rgba(0,0,0,0.6))',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}>
        {/* We use a high-quality 3D piece set URL if available, or just standard with filters */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img 
          src={`https://lichess1.org/assets/piece/cburnett/${p}.svg`} 
          style={{ width: '90%', height: '90%' }}
          alt={p}
        />
      </div>
    )
  })
  
  return custom
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

export default function ChessBoard({ 
  fen, 
  svg, 
  size, 
  theme = 'default',
  onMove,
  isDraggable = true,
  orientation = 'white',
  highlightSquares
}: ChessBoardProps) {
  const [game, setGame] = useState(() => buildGame(fen))
  const [position, setPosition] = useState(game.fen())
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null)
  const [focusedSquare, setFocusedSquare] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState('')
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
    setSelectedSquare(null)
    setAnnouncement('')
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

  const pieces = useMemo(() => customPieces(theme), [theme])

  const applyLocalMove = (from: string, to: string): boolean => {
    const nextGame = new Chess(game.fen())
    try {
      const move = nextGame.move({
        from,
        to,
        promotion: 'q',
      })
      if (!move) return false

      // Announce the move
      setAnnouncement(moveToSpeech(move))
    } catch {
      return false
    }

    setGame(nextGame)
    setPosition(nextGame.fen())
    setSelectedSquare(null)

    if (onMove) onMove(from, to)
    return true
  }

  const isMyPiece = (piece: any): boolean => {
    if (!piece) return false
    const pieceColor = piece.color === 'w' ? 'white' : 'black'
    return pieceColor === orientation
  }

  const canInteract = !!isDraggable
  const isMyTurn = useMemo(() => {
    const turn = game.turn() === 'w' ? 'white' : 'black'
    return turn === orientation
  }, [game, orientation])

  const legalTargetSquares = useMemo(() => {
    if (!selectedSquare) return []
    try {
      const moves = game.moves({ square: selectedSquare as any, verbose: true }) as Array<any>
      return moves.map((m) => m.to).filter(Boolean) as string[]
    } catch {
      return []
    }
  }, [game, selectedSquare])

  const mergedSquareStyles = useMemo(() => {
    const styles: Record<string, CSSProperties> = { ...(highlightSquares ?? {}) }
    const isWood = theme === 'wood'

    if (focusedSquare) {
      styles[focusedSquare] = {
        ...(styles[focusedSquare] ?? {}),
        // High contrast focus ring (Double border: Black outer, White inner) to pass WCAG on any color
        boxShadow: 'inset 0 0 0 2px #ffffff, inset 0 0 0 4px #000000',
        zIndex: 10,
      }
    }

    if (selectedSquare) {
      styles[selectedSquare] = {
        ...(styles[selectedSquare] ?? {}),
        boxShadow: (styles[selectedSquare]?.boxShadow ? styles[selectedSquare].boxShadow + ', ' : '') + 'inset 0 0 0 4px rgba(59, 130, 246, 0.95)',
      }
    }

    for (const sq of legalTargetSquares) {
      const isDark = isDarkSquare(sq)
      const baseWood = isDark ? WOOD_DARK : WOOD_LIGHT
      const baseWoodTexture = isDark
        ? 'radial-gradient(circle, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 100%)'
        : 'radial-gradient(circle, rgba(255,255,255,0.10) 0%, rgba(0,0,0,0) 100%)'

      // Dot indicator + subtle ring. Use background-image layering so it works on both light/dark squares.
      const dot = 'radial-gradient(circle at center, rgba(34,197,94,0.95) 0 14%, rgba(34,197,94,0.0) 15%)'
      const ring = 'radial-gradient(circle at center, rgba(34,197,94,0.0) 0 26%, rgba(34,197,94,0.45) 27% 31%, rgba(0,0,0,0) 32%)'

      const existingBg = styles[sq]?.backgroundImage
      const layeredBg = existingBg
        ? `${ring}, ${dot}, ${existingBg}`
        : isWood
          ? `${ring}, ${dot}, ${baseWoodTexture}`
          : `${ring}, ${dot}`

      styles[sq] = {
        ...(styles[sq] ?? {}),
        // Keep any existing highlight border and add a gentle green outline.
        boxShadow:
          (styles[sq]?.boxShadow ? `${styles[sq]?.boxShadow}, ` : '') +
          'inset 0 0 0 3px rgba(34, 197, 94, 0.38)',
        backgroundImage: layeredBg,
        backgroundColor: styles[sq]?.backgroundColor ?? (isWood ? baseWood : undefined),
      }
    }

    return styles
  }, [focusedSquare, highlightSquares, legalTargetSquares, selectedSquare, theme])

  const handlePieceDrop = (sourceSquare: string, targetSquare: string) => {
    if (!canInteract || !isMyTurn) return false
    setSelectedSquare(null)
    return applyLocalMove(sourceSquare, targetSquare)
  }

  const handleSquareClick = (square: string) => {
    if (!canInteract) return

    // If it's not our turn, allow deselecting but avoid new selection/moves.
    if (!isMyTurn) {
      setSelectedSquare(null)
      return
    }

    const piece = game.get(square as any)

    // No selection yet: only allow selecting own piece.
    if (!selectedSquare) {
      if (isMyPiece(piece)) setSelectedSquare(square)
      return
    }

    // Clicking the same square toggles selection off.
    if (selectedSquare === square) {
      setSelectedSquare(null)
      return
    }

    // If clicking another own piece, switch selection.
    if (isMyPiece(piece)) {
      setSelectedSquare(square)
      return
    }

    // Otherwise attempt move from selectedSquare to clicked square.
    const ok = applyLocalMove(selectedSquare, square)
    if (!ok) {
        setSelectedSquare(null)
        setAnnouncement('Illegal move')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!canInteract) return

    // If no focus yet, start at sensible default (e4 for white, e5 for black usually, or just a1/h8)
    if (!focusedSquare) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Tab') {
        // Default to center-ish
        setFocusedSquare('e4')
        return
      }
      return
    }

    const { row, col } = getSquareCoordinates(focusedSquare)
    let nextRow = row
    let nextCol = col
    let handled = true

    // Flip controls if orientation is black
    const isFlipped = orientation === 'black'

    switch (e.key) {
      case 'ArrowUp':
        nextRow = isFlipped ? row - 1 : row + 1
        break
      case 'ArrowDown':
        nextRow = isFlipped ? row + 1 : row - 1
        break
      case 'ArrowLeft':
        nextCol = isFlipped ? col + 1 : col - 1
        break
      case 'ArrowRight':
        nextCol = isFlipped ? col - 1 : col + 1
        break
      case ' ':
      case 'Enter':
        e.preventDefault() // prevent scrolling
        handleSquareClick(focusedSquare)
        return
      case 'Escape':
        setSelectedSquare(null)
        setFocusedSquare(null) // Optional: lose focus or just clear selection? Contract says "cancel selection / clear active piece"
        return
      default:
        handled = false
    }

    if (handled) {
      e.preventDefault()
      const nextSquare = getSquareFromCoordinates(nextRow, nextCol)
      if (nextSquare) {
        setFocusedSquare(nextSquare)
      }
    }
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
      style={{ maxWidth, width: '100%', margin: '0 auto', outline: 'none' }}
      tabIndex={0}
      role="grid"
      aria-label={`Chess Board. ${isMyTurn ? 'Your turn.' : 'Waiting for opponent.'}`}
      onKeyDown={handleKeyDown}
      onFocus={() => {
        if (!focusedSquare) setFocusedSquare('e4')
      }}
      onBlur={() => {
        // Optional: clear focusedSquare on blur if desired, but keeping it can be useful
        // setFocusedSquare(null)
      }}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announcement}
      </div>
      <Chessboard
        position={position}
        boardWidth={boardWidth}
        areArrowsAllowed
        arePiecesDraggable={isDraggable}
        isDraggablePiece={({ piece }) => {
          // Restrict dragging to pieces of the orientation color
          if (!orientation) return true
          const pieceColor = piece[0] === 'w' ? 'white' : 'black'
          return pieceColor === orientation
        }}
        onPieceDrop={handlePieceDrop}
        onSquareClick={(square) => handleSquareClick(String(square))}
        boardOrientation={orientation}
        customSquareStyles={mergedSquareStyles}
        customLightSquareStyle={themeStyles.customLightSquareStyle}
        customDarkSquareStyle={themeStyles.customDarkSquareStyle}
        customBoardStyle={themeStyles.customBoardStyle}
        customPieces={pieces}
      />
    </div>
  )
}
