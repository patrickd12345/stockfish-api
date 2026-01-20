'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStockfish } from '@/hooks/useStockfish'
import EvalGauge, { formatEvalLabel } from '@/components/EvalGauge'
import { useAgentTone } from '@/hooks/useAgentTone'

interface LiveCommentaryProps {
  fen: string
  moves: string
  myColor?: 'white' | 'black' | null
  variant?: 'live' | 'postGame'
  status?: string | null
  winner?: 'white' | 'black' | null
  opponentName?: string | null
}

const MIN_DEPTH_FOR_COMMENT = 8
const BLUNDER_SWING_CP = 300
const MISTAKE_SWING_CP = 150

const parseTurnFromFen = (fen: string): 'w' | 'b' => {
  const parts = fen.split(' ')
  return (parts[1] === 'b' ? 'b' : 'w')
}

const formatEval = (evaluation: number | null, mate: number | null) => {
  if (typeof mate === 'number') {
    return mate > 0 ? `Mate in ${mate}` : `Mate in ${Math.abs(mate)} for Black`
  }
  if (typeof evaluation === 'number') {
    const pawns = (evaluation / 100).toFixed(2)
    return evaluation > 0 ? `+${pawns}` : pawns
  }
  return '0.00'
}

const formatSwing = (delta: number) => {
  const pawns = Math.abs(delta / 100).toFixed(2)
  return pawns
}

const describeSwing = (delta: number) => {
  const abs = Math.abs(delta)
  if (abs >= BLUNDER_SWING_CP) {
    return 'blunder'
  }
  if (abs >= MISTAKE_SWING_CP) {
    return 'mistake'
  }
  return 'shift'
}

function getMaterialPointDiffFromFen(fen: string): number {
  // Returns (whitePoints - blackPoints), using standard material values.
  const placement = (fen || '').split(' ')[0] || ''
  if (!placement.includes('/')) return 0

  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 }
  let white = 0
  let black = 0

  for (const ch of placement) {
    if (ch === '/' || (ch >= '1' && ch <= '8')) continue
    const lower = ch.toLowerCase()
    const value = values[lower]
    if (typeof value !== 'number') continue
    if (ch === lower) black += value
    else white += value
  }

  return white - black
}

export default function LiveCommentary({
  fen,
  moves,
  myColor,
  variant = 'live',
  status = null,
  winner = null,
  opponentName = null,
}: LiveCommentaryProps) {
  const { state: engineState, startAnalysis } = useStockfish({ depth: 16, lines: 1 })
  const { tone } = useAgentTone()
  const [position, setPosition] = useState({ x: variant === 'postGame' ? 24 : 24, y: variant === 'postGame' ? 84 : 120 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [commentary, setCommentary] = useState<string>('Waiting for the next move…')
  const [commentarySource, setCommentarySource] = useState<'llm' | 'fallback'>('fallback')
  const lastMoveRef = useRef<string | null>(null)
  const lastEvalRef = useRef<number | null>(null)
  const lastCommentedMoveRef = useRef<string | null>(null)
  const llmAbortRef = useRef<AbortController | null>(null)

  const lastMove = useMemo(() => {
    const trimmed = moves.trim()
    if (!trimmed) return null
    const parts = trimmed.split(/\s+/)
    return parts[parts.length - 1] || null
  }, [moves])

  useEffect(() => {
    if (variant === 'postGame') return
    if (!lastMove || lastMove === lastMoveRef.current) return
    lastMoveRef.current = lastMove
    startAnalysis(fen, parseTurnFromFen(fen))
  }, [fen, lastMove, startAnalysis, variant])

  useEffect(() => {
    if (variant === 'postGame') return
    if (!lastMove || lastMove === lastCommentedMoveRef.current) {
      return
    }
    if (engineState.depth < MIN_DEPTH_FOR_COMMENT) {
      return
    }
    if (engineState.evaluation === null && engineState.mate === null) {
      return
    }

    const currentEval = engineState.mate ? null : engineState.evaluation
    const previousEval = lastEvalRef.current
    const swing = typeof currentEval === 'number' && typeof previousEval === 'number'
      ? currentEval - previousEval
      : null

    const evalLabelCompact = formatEvalLabel(engineState.evaluation, engineState.mate)
    if (swing === null) {
      setCommentary(`After ${lastMove}, evaluation is ${evalLabelCompact}.`)
    } else {
      const swingLabel = formatSwing(swing)
      const descriptor = describeSwing(swing)
      const directionSide = swing > 0 ? 'white' : 'black'
      const direction =
        myColor === 'white'
          ? (directionSide === 'white' ? 'toward you' : 'toward your opponent')
          : myColor === 'black'
            ? (directionSide === 'black' ? 'toward you' : 'toward your opponent')
            : (directionSide === 'white' ? 'toward White' : 'toward Black')
      setCommentary(
        `After ${lastMove}, evaluation moved ${swingLabel} pawns ${direction} (${descriptor}). Now ${evalLabelCompact}.`
      )
    }
    setCommentarySource('fallback')

    // Ask the onboard LLM to write interpreted feedback using history + Stockfish output.
    llmAbortRef.current?.abort()
    const ac = new AbortController()
    llmAbortRef.current = ac

    const payload = {
      fen,
      moves,
      myColor: myColor ?? null,
      tone,
      lastMove,
      evaluation: engineState.evaluation,
      mate: engineState.mate,
      depth: engineState.depth,
      bestLine: engineState.bestLine,
      bestMove: engineState.bestMove,
      evalLabel: evalLabelCompact,
    }

    fetch('/api/coach/live-commentary', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!json || typeof json.commentary !== 'string') return
        setCommentary(json.commentary)
        setCommentarySource(json.source === 'llm' ? 'llm' : 'fallback')
      })
      .catch(() => null)

    if (typeof currentEval === 'number') {
      lastEvalRef.current = currentEval
    }
    lastCommentedMoveRef.current = lastMove
  }, [
    engineState.bestLine,
    engineState.bestMove,
    engineState.depth,
    engineState.evaluation,
    engineState.mate,
    fen,
    lastMove,
    moves,
    myColor,
    tone,
    variant
  ])

  useEffect(() => {
    if (variant !== 'postGame') return

    llmAbortRef.current?.abort()
    lastMoveRef.current = null
    lastCommentedMoveRef.current = null

    // Analyze final position and generate recap in this same overlay.
    startAnalysis(fen, parseTurnFromFen(fen))

    const diff = getMaterialPointDiffFromFen(fen)
    const leader = diff === 0 ? null : diff > 0 ? 'White' : 'Black'
    const points = Math.abs(diff)
    const materialLine = leader ? `Material: ${leader} +${points}.` : 'Material is equal.'

    setCommentary(`Post-game recap… ${materialLine}`)
    setCommentarySource('fallback')
  }, [fen, startAnalysis, variant])

  useEffect(() => {
    if (variant !== 'postGame') return
    if (!fen || fen === 'start') return
    if (engineState.depth < 10) return
    if (engineState.evaluation === null && engineState.mate === null) return

    llmAbortRef.current?.abort()
    const ac = new AbortController()
    llmAbortRef.current = ac

    const evalLabelCompact = formatEvalLabel(engineState.evaluation, engineState.mate)

    fetch('/api/coach/post-game-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        fen,
        moves,
        myColor: myColor ?? null,
        tone,
        status,
        winner,
        opponentName,
        evaluation: engineState.evaluation,
        mate: engineState.mate,
        depth: engineState.depth,
        bestLine: engineState.bestLine,
        bestMove: engineState.bestMove,
        evalLabel: evalLabelCompact
      })
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!json || typeof json.review !== 'string') return
        setCommentary(json.review)
        setCommentarySource(json.source === 'llm' ? 'llm' : 'fallback')
      })
      .catch(() => null)

    return () => ac.abort()
  }, [
    engineState.bestLine,
    engineState.bestMove,
    engineState.depth,
    engineState.evaluation,
    engineState.mate,
    fen,
    moves,
    myColor,
    tone,
    status,
    winner,
    opponentName,
    variant
  ])

  useEffect(() => {
    const handleMove = (event: globalThis.MouseEvent) => {
      if (!isDragging) return
      setPosition({
        x: Math.max(8, event.clientX - dragOffset.current.x),
        y: Math.max(8, event.clientY - dragOffset.current.y),
      })
    }

    const handleUp = () => setIsDragging(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [isDragging])

  const handleDragStart = (event: ReactMouseEvent<HTMLButtonElement>) => {
    setIsDragging(true)
    dragOffset.current = {
      x: event.clientX - position.x,
      y: event.clientY - position.y,
    }
  }

  const panelWidth = variant === 'postGame' ? 380 : 260
  const panelPadding = variant === 'postGame' ? '14px 16px 16px' : '12px 14px 14px'
  const fontSize = variant === 'postGame' ? '14px' : '13px'

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: `${panelWidth}px`,
        background: 'rgba(15, 23, 42, 0.95)',
        color: '#f8fafc',
        borderRadius: '14px',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.45)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        padding: panelPadding,
        zIndex: 60,
      }}
    >
      <button
        type="button"
        onMouseDown={handleDragStart}
        style={{
          cursor: 'move',
          width: '100%',
          border: 'none',
          background: 'transparent',
          color: '#f8fafc',
          fontWeight: 700,
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          padding: 0,
          marginBottom: '8px',
        }}
      >
        <span>
          {variant === 'postGame'
            ? (commentarySource === 'llm' ? 'Post-game coach' : 'Post-game (Stockfish)')
            : (commentarySource === 'llm' ? 'Coach' : 'Stockfish Coach')}
        </span>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>Drag</span>
      </button>
      <div style={{ fontSize, lineHeight: 1.45 }}>{commentary}</div>
      <div style={{ marginTop: '10px' }}>
        <EvalGauge evaluationCp={engineState.evaluation} mate={engineState.mate} />
      </div>
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#cbd5f5' }}>
        {commentarySource === 'llm'
          ? 'LLM coach + Stockfish'
          : (engineState.isReady ? `Depth ${engineState.depth}` : 'Engine loading…')}
      </div>
    </div>
  )
}
