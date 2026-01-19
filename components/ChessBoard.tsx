'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'

interface ChessBoardProps {
  fen?: string
  svg?: string
  size?: number | string
  theme?: 'default' | 'wood'
  onMove?: (from: string, to: string) => void
  isDraggable?: boolean
  orientation?: 'white' | 'black'
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
  orientation = 'white'
}: ChessBoardProps) {
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

  const pieces = useMemo(() => customPieces(theme), [theme])

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
    
    // Notify parent
    if (onMove) {
      onMove(sourceSquare, targetSquare)
    }
    
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
        arePiecesDraggable={isDraggable}
        isDraggablePiece={({ piece }) => {
          // Restrict dragging to pieces of the orientation color
          if (!orientation) return true
          const pieceColor = piece[0] === 'w' ? 'white' : 'black'
          return pieceColor === orientation
        }}
        onPieceDrop={handlePieceDrop}
        boardOrientation={orientation}
        customLightSquareStyle={themeStyles.customLightSquareStyle}
        customDarkSquareStyle={themeStyles.customDarkSquareStyle}
        customBoardStyle={themeStyles.customBoardStyle}
        customPieces={pieces}
      />
    </div>
  )
}
