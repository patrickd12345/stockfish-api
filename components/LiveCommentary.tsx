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
  lichessGameId?: string | null
}

type CommentaryItem = { text: string; source: 'llm' | 'fallback'; timestamp: number }

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
  lichessGameId = null,
}: LiveCommentaryProps) {
  const { state: engineState, startAnalysis } = useStockfish({ depth: 16, lines: 1 })
  const { tone } = useAgentTone()
  const [position, setPosition] = useState({ x: variant === 'postGame' ? 24 : 24, y: variant === 'postGame' ? 84 : 120 })
  const [isDragging, setIsDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const [commentaryHistory, setCommentaryHistory] = useState<CommentaryItem[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastMoveRef = useRef<string | null>(null)
  const lastEvalRef = useRef<number | null>(null)
  const lastCommentedMoveRef = useRef<string | null>(null)
  const llmAbortRef = useRef<AbortController | null>(null)
  const [creatingDrill, setCreatingDrill] = useState<boolean>(false)
  const [drillCreated, setDrillCreated] = useState<boolean>(false)
  const [drillError, setDrillError] = useState<string | null>(null)
  const [relatedDrills, setRelatedDrills] = useState<Array<{ drillId: string; ply: number; patternTag: string }>>([])
  const [loadingDrills, setLoadingDrills] = useState<boolean>(false)

  // Auto-scroll to bottom when new commentary arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [commentaryHistory])

  const lastMove = useMemo(() => {
    const trimmed = moves.trim()
    if (!trimmed) return null
    const parts = trimmed.split(/\s+/)
    return parts[parts.length - 1] || null
  }, [moves])

  // Clear history when game resets (moves become empty)
  useEffect(() => {
    if (!moves) {
      setCommentaryHistory([])
      lastMoveRef.current = null
      lastEvalRef.current = null
      lastCommentedMoveRef.current = null
    }
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
    let fallbackText = ''
    if (swing === null) {
      fallbackText = `After ${lastMove}, evaluation is ${evalLabelCompact}.`
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
      fallbackText = `After ${lastMove}, evaluation moved ${swingLabel} pawns ${direction} (${descriptor}). Now ${evalLabelCompact}.`
    }

    // Add fallback commentary immediately, but we might replace it with LLM version if it arrives for the SAME move.
    setCommentaryHistory(prev => {
      const isNewMove = prev.length === 0 || lastCommentedMoveRef.current !== lastMove
      if (isNewMove) {
        const next: CommentaryItem[] = [...prev, { text: fallbackText, source: 'fallback', timestamp: Date.now() }]
        return next.slice(-50) // Keep last 50 entries
      }
      const last = prev[prev.length - 1]
      if (last.source === 'fallback') {
        const newHistory: CommentaryItem[] = [...prev]
        newHistory[newHistory.length - 1] = { ...last, text: fallbackText }
        return newHistory
      }
      return prev
    })

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
        
        setCommentaryHistory(prev => {
          if (prev.length === 0) return prev
          const newHistory: CommentaryItem[] = [...prev]
          const lastIndex = newHistory.length - 1
          newHistory[lastIndex] = { 
            text: json.commentary, 
            source: (json.source === 'llm' ? 'llm' : 'fallback') as 'llm' | 'fallback',
            timestamp: Date.now() 
          }
          return newHistory
        })
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

    setCommentaryHistory([{ text: `Post-game recap… ${materialLine}`, source: 'fallback', timestamp: Date.now() }])
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
        setCommentaryHistory([{ 
          text: json.review, 
          source: (json.source === 'llm' ? 'llm' : 'fallback') as 'llm' | 'fallback', 
          timestamp: Date.now() 
        }])
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

  // Load related drills when in post-game mode and gameId is available
  useEffect(() => {
    if (variant !== 'postGame' || !lichessGameId || !commentaryHistory.length) return

    setLoadingDrills(true)
    fetch(`/api/blunder-dna/game-drills?gameId=${encodeURIComponent(lichessGameId)}`)
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (json?.drills) {
          setRelatedDrills(json.drills)
        }
      })
      .catch(() => null)
      .finally(() => setLoadingDrills(false))
  }, [variant, lichessGameId, commentaryHistory.length])

  /**
   * Creates a drill from the post-game review.
   * 
   * This function is called when the user clicks "Create Drill from Review"
   * in the post-game review UI. It sends the game data and review text to
   * the API endpoint which analyzes the position and creates a drill record.
   * 
   * The drill is automatically integrated into the Blunder DNA system and
   * appears in the Daily Drills section for practice.
   * 
   * @see docs/POST_GAME_REVIEW_DRILLS.md
   */
  const handleCreateDrill = async () => {
    if (!lichessGameId || !commentaryHistory.length || !fen || !moves) {
      setDrillError('Missing game information')
      return
    }

    const review = commentaryHistory[commentaryHistory.length - 1]?.text
    if (!review) {
      setDrillError('No review available')
      return
    }

    setCreatingDrill(true)
    setDrillError(null)

    try {
      const res = await fetch('/api/blunder-dna/create-drill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lichessGameId,
          fen,
          moves,
          myColor: myColor ?? null,
          review,
          evaluation: engineState.evaluation,
          bestMove: engineState.bestMove,
          bestLine: engineState.bestLine,
          depth: engineState.depth
        })
      })

      const json = await res.json()
      if (!res.ok) {
        throw new Error(json.error || 'Failed to create drill')
      }

      setDrillCreated(true)
      // Reload related drills
      if (lichessGameId) {
        fetch(`/api/blunder-dna/game-drills?gameId=${encodeURIComponent(lichessGameId)}`)
          .then(async (res) => {
            const json = await res.json().catch(() => null)
            if (json?.drills) {
              setRelatedDrills(json.drills)
            }
          })
          .catch(() => null)
      }
    } catch (err: any) {
      setDrillError(err.message || 'Failed to create drill')
    } finally {
      setCreatingDrill(false)
    }
  }

  const panelWidth = variant === 'postGame' ? 380 : 300
  const panelPadding = variant === 'postGame' ? '14px 16px 16px' : '12px 14px 14px'
  const fontSize = variant === 'postGame' ? '14px' : '13px'

  const currentCommentary = commentaryHistory[commentaryHistory.length - 1]
  const isLLM = currentCommentary?.source === 'llm'

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
        display: 'flex',
        flexDirection: 'column',
        maxHeight: variant === 'postGame' ? '80vh' : '400px',
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
          flexShrink: 0,
        }}
      >
        <span>
          {variant === 'postGame'
            ? (isLLM ? 'Post-game coach' : 'Post-game (Stockfish)')
            : (isLLM ? 'Coach' : 'Stockfish Coach')}
        </span>
        <span style={{ fontSize: '10px', opacity: 0.7 }}>Drag</span>
      </button>

      <div 
        ref={scrollRef}
        style={{ 
          fontSize, 
          lineHeight: 1.45, 
          overflowY: 'auto', 
          flex: 1,
          paddingRight: '4px',
          marginRight: '-4px',
        }}
      >
        {commentaryHistory.length === 0 ? (
          <div style={{ opacity: 0.6, fontStyle: 'italic' }}>Waiting for the next move…</div>
        ) : (
          commentaryHistory.map((item, i) => (
            <div 
              key={i} 
              style={{ 
                marginBottom: i === commentaryHistory.length - 1 ? 0 : '12px',
                paddingBottom: i === commentaryHistory.length - 1 ? 0 : '12px',
                borderBottom: i === commentaryHistory.length - 1 ? 'none' : '1px solid rgba(148, 163, 184, 0.1)',
                opacity: i === commentaryHistory.length - 1 ? 1 : 0.6,
                transition: 'opacity 0.2s',
              }}
            >
              {item.text}
            </div>
          ))
        )}
      </div>

      <div style={{ marginTop: '10px', flexShrink: 0 }}>
        <EvalGauge evaluationCp={engineState.evaluation} mate={engineState.mate} myColor={myColor} />
      </div>
      <div style={{ marginTop: '10px', fontSize: '11px', color: '#cbd5f5', flexShrink: 0 }}>
        {isLLM
          ? 'LLM coach + Stockfish'
          : (engineState.isReady ? `Depth ${engineState.depth}` : 'Engine loading…')}
      </div>

      {variant === 'postGame' && commentaryHistory.length > 0 && (
        <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(148, 163, 184, 0.1)', flexShrink: 0 }}>
          {lichessGameId && relatedDrills.length > 0 && (
            <div style={{ marginBottom: '8px', fontSize: '11px', color: '#86efac' }}>
              ✓ {relatedDrills.length} drill{relatedDrills.length !== 1 ? 's' : ''} from this game
              {' '}
              <a
                href="/?tab=dna"
                style={{ color: '#fbbf24', textDecoration: 'underline' }}
                onClick={(e) => {
                  e.preventDefault()
                  // Trigger tab switch - this is a simple approach
                  window.location.href = '/?tab=dna'
                }}
              >
                View in Blunder DNA →
              </a>
            </div>
          )}
          {drillCreated ? (
            <div style={{ fontSize: '11px', color: '#86efac', fontWeight: 500 }}>
              ✓ Drill created! Check the Blunder DNA tab to practice it.
            </div>
          ) : drillError ? (
            <div style={{ fontSize: '11px', color: '#fca5a5' }}>{drillError}</div>
          ) : (
            <>
              <button
                onClick={handleCreateDrill}
                disabled={creatingDrill || !lichessGameId}
                style={{
                  width: '100%',
                  padding: '6px 12px',
                  fontSize: '11px',
                  backgroundColor: creatingDrill || !lichessGameId ? 'rgba(148, 163, 184, 0.2)' : 'rgba(251, 146, 60, 0.2)',
                  border: '1px solid rgba(251, 146, 60, 0.5)',
                  borderRadius: '6px',
                  color: '#fbbf24',
                  cursor: creatingDrill || !lichessGameId ? 'not-allowed' : 'pointer',
                  opacity: creatingDrill || !lichessGameId ? 0.6 : 1,
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  if (!creatingDrill && lichessGameId) {
                    e.currentTarget.style.backgroundColor = 'rgba(251, 146, 60, 0.3)'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = creatingDrill || !lichessGameId ? 'rgba(148, 163, 184, 0.2)' : 'rgba(251, 146, 60, 0.2)'
                }}
              >
                {creatingDrill ? 'Creating drill...' : '📚 Create Drill from Review'}
              </button>
              <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '4px', textAlign: 'center' }}>
                {lichessGameId ? 'Add this game to your Blunder DNA training' : 'Game ID required to create drill'}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
