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
  opponentName,
  lichessGameId
}: {
  fen: string
  moves: string
  myColor: 'white' | 'black'
  status: string
  winner?: 'white' | 'black'
  opponentName?: string | null
  lichessGameId?: string | null
}) {
  const { state: engineState, startAnalysis } = useStockfish({ depth: 18, lines: 1 })
  const { tone } = useAgentTone()
  const [review, setReview] = useState<string>('')
  const [source, setSource] = useState<'llm' | 'fallback'>('fallback')
  const [loading, setLoading] = useState<boolean>(true)
  const [creatingDrill, setCreatingDrill] = useState<boolean>(false)
  const [drillCreated, setDrillCreated] = useState<boolean>(false)
  const [drillError, setDrillError] = useState<string | null>(null)
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

  const handleCreateDrill = async () => {
    if (!lichessGameId || !review || !fen || !moves) {
      setDrillError('Missing game information')
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
          myColor,
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
      // Refresh the daily drills queue
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (err: any) {
      setDrillError(err.message || 'Failed to create drill')
    } finally {
      setCreatingDrill(false)
    }
  }

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

      {review && lichessGameId && !loading && (
        <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-2">
          {drillCreated ? (
            <div className="text-xs text-emerald-400 font-medium">
              ✓ Drill created! Check the Blunder DNA tab to practice it.
            </div>
          ) : drillError ? (
            <div className="text-xs text-rose-400">{drillError}</div>
          ) : (
            <>
              <button
                onClick={handleCreateDrill}
                disabled={creatingDrill}
                className="btn-secondary text-xs py-2 px-3 bg-terracotta/20 hover:bg-terracotta/30 border-terracotta/50 text-terracotta-light disabled:opacity-50"
              >
                {creatingDrill ? 'Creating drill...' : '📚 Create Drill from Review'}
              </button>
              <div className="text-[10px] text-sage-500">
                This will add a practice drill to your Blunder DNA training based on this game.
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

