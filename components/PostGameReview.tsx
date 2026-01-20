'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useStockfish } from '@/hooks/useStockfish'
import { formatEvalLabel } from '@/components/EvalGauge'
import { useAgentTone } from '@/hooks/useAgentTone'

function parseTurnFromFen(fen: string): 'w' | 'b' {
  const parts = (fen || '').split(' ')
  return parts[1] === 'b' ? 'b' : 'w'
}

export default function PostGameReview({
  fen,
  moves,
  myColor,
  status,
  winner,
  opponentName
}: {
  fen: string
  moves: string
  myColor: 'white' | 'black'
  status: string
  winner?: 'white' | 'black'
  opponentName?: string | null
}) {
  const { state: engineState, startAnalysis } = useStockfish({ depth: 18, lines: 1 })
  const { tone } = useAgentTone()
  const [review, setReview] = useState<string>('')
  const [source, setSource] = useState<'llm' | 'fallback'>('fallback')
  const [loading, setLoading] = useState<boolean>(true)
  const abortRef = useRef<AbortController | null>(null)

  const evalLabel = useMemo(
    () => formatEvalLabel(engineState.evaluation, engineState.mate),
    [engineState.evaluation, engineState.mate]
  )

  useEffect(() => {
    // Kick Stockfish on the final position.
    if (!fen || fen === 'start') return
    startAnalysis(fen, parseTurnFromFen(fen))
  }, [fen, startAnalysis])

  useEffect(() => {
    if (!fen || fen === 'start') return
    if (engineState.depth < 10) return
    if (engineState.evaluation === null && engineState.mate === null) return

    abortRef.current?.abort()
    const ac = new AbortController()
    abortRef.current = ac
    setLoading(true)

    fetch('/api/coach/post-game-review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ac.signal,
      body: JSON.stringify({
        fen,
        moves,
        myColor,
        tone,
        status,
        winner: winner ?? null,
        opponentName: opponentName ?? null,
        evaluation: engineState.evaluation,
        mate: engineState.mate,
        depth: engineState.depth,
        bestLine: engineState.bestLine,
        bestMove: engineState.bestMove,
        evalLabel
      })
    })
      .then(async (res) => {
        const json = await res.json().catch(() => null)
        if (!json || typeof json.review !== 'string') return
        setReview(json.review)
        setSource(json.source === 'llm' ? 'llm' : 'fallback')
      })
      .catch(() => null)
      .finally(() => setLoading(false))

    return () => ac.abort()
  }, [
    engineState.bestLine,
    engineState.bestMove,
    engineState.depth,
    engineState.evaluation,
    engineState.mate,
    evalLabel,
    fen,
    moves,
    myColor,
    tone,
    opponentName,
    status,
    winner
  ])

  const title = 'Post-game review'
  const subtitle = source === 'llm' ? 'LLM coach + Stockfish' : `Stockfish depth ${engineState.depth}`

  return (
    <div className="bg-sage-900/40 rounded-xl p-4 border border-white/5 flex flex-col min-h-[220px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-xs font-bold text-sage-400 uppercase tracking-wider">{title}</h4>
          <div className="text-[11px] text-sage-500 mt-1">{subtitle}</div>
        </div>
        <div className="text-[11px] text-sage-300 font-semibold">
          {winner ? `Winner: ${winner}` : status ? `End: ${status}` : 'Game over'}
        </div>
      </div>

      <div className="mt-3 text-sm text-sage-200 whitespace-pre-wrap leading-relaxed">
        {loading ? (
          <div className="animate-pulse text-sage-500">Generating review…</div>
        ) : review ? (
          review
        ) : (
          <div className="text-sage-500">No review available.</div>
        )}
      </div>
    </div>
  )
}

