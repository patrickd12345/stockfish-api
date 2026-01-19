'use client'

import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useStockfish } from '@/hooks/useStockfish'
import EvalGauge, { formatEvalLabel } from '@/components/EvalGauge'

interface LiveCommentaryProps {
  fen: string
  moves: string
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

export default function LiveCommentary({ fen, moves }: LiveCommentaryProps) {
  const { state: engineState, startAnalysis } = useStockfish({ depth: 16, lines: 1 })
  const [position, setPosition] = useState({ x: 24, y: 120 })
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
    if (!lastMove || lastMove === lastMoveRef.current) return
    lastMoveRef.current = lastMove
    startAnalysis(fen, parseTurnFromFen(fen))
  }, [fen, lastMove, startAnalysis])

  useEffect(() => {
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

    const evalLabel = formatEval(engineState.evaluation, engineState.mate)
    const evalLabelCompact = formatEvalLabel(engineState.evaluation, engineState.mate)
    if (swing === null) {
      setCommentary(`After ${lastMove}, evaluation is ${evalLabelCompact}.`)
    } else {
      const swingLabel = formatSwing(swing)
      const descriptor = describeSwing(swing)
      const direction = swing > 0 ? 'toward White' : 'toward Black'
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
  }, [engineState.bestLine, engineState.bestMove, engineState.depth, engineState.evaluation, engineState.mate, fen, lastMove, moves])

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

  return (
    <div
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        width: '260px',
        background: 'rgba(15, 23, 42, 0.95)',
        color: '#f8fafc',
        borderRadius: '14px',
        boxShadow: '0 12px 30px rgba(15, 23, 42, 0.45)',
        border: '1px solid rgba(148, 163, 184, 0.25)',
        padding: '12px 14px 14px',
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
        <span>{commentarySource === 'llm' ? 'Coach' : 'Stockfish Coach'}</span>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>Drag</span>
      </button>
      <div style={{ fontSize: '13px', lineHeight: 1.4 }}>{commentary}</div>
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
