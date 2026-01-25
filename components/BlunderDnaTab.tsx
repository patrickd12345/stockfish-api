'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChessBoard from '@/components/ChessBoard'
import EvalGauge from '@/components/EvalGauge'
import FeatureGate from '@/components/FeatureGate'
import BlunderDnaReport from '@/components/BlunderDnaReport'
import { BlunderTheme, GamePhase } from '@/lib/blunderDnaV1'
import { useAgentTone } from '@/hooks/useAgentTone'
import { uciToSan, uciSequenceToSan } from '@/lib/chessNotation'

type PatternTag =
  | 'hanging_piece'
  | 'missed_threat'
  | 'missed_win'
  | 'unsafe_king'
  | 'bad_capture'
  | 'time_trouble_collapse'

interface PatternSummary {
  patternTag: PatternTag
  label: string
  occurrences: number
  weaknessScore: number
  updatedAt: string
}

interface Drill {
  drillId: string
  lichessGameId: string
  ply: number
  fen: string
  sideToMove: 'white' | 'black'
  myMove: string
  bestMove: string
  pv: string
  evalBefore: number
  evalAfter: number
  patternTag: PatternTag
  difficulty: number
  createdAt: string
}

interface DailyDrillsResponse {
  date: string
  drills: Drill[]
  patterns: PatternSummary[]
}

/**
 * Map BlunderTheme to PatternTag
 */
function themeToPatternTag(theme: BlunderTheme): PatternTag {
  switch (theme) {
    case BlunderTheme.HANGING_PIECE:
      return 'hanging_piece'
    case BlunderTheme.MISSED_THREAT:
      return 'missed_threat'
    case BlunderTheme.MISSED_WIN:
      return 'missed_win'
    case BlunderTheme.UNSAFE_KING:
      return 'unsafe_king'
    case BlunderTheme.BAD_CAPTURE:
      return 'bad_capture'
    case BlunderTheme.TIME_TROUBLE:
      return 'time_trouble_collapse'
    default:
      return 'missed_threat'
  }
}

/**
 * Determine game phase from ply (move number)
 */
function getPhaseFromPly(ply: number): GamePhase {
  const moveNumber = Math.ceil((ply + 1) / 2)
  if (moveNumber <= 15) return GamePhase.OPENING
  if (moveNumber <= 30) return GamePhase.MIDDLEGAME
  return GamePhase.ENDGAME
}

export default function BlunderDnaTab() {
  const [activeView, setActiveView] = useState<'drills' | 'report'>('drills')
  const [drillFilter, setDrillFilter] = useState<{ theme?: PatternTag; phase?: GamePhase } | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DailyDrillsResponse | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [lastAttemptResult, setLastAttemptResult] = useState<{ ok: boolean; message: string; commentary?: string } | null>(null)
  const [commentaryLoading, setCommentaryLoading] = useState(false)
  const didAutoAnalyzeRef = useRef(false)
  const { tone } = useAgentTone()

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const filteredDrills = useMemo(() => {
    if (!data?.drills) return []
    if (!drillFilter) return data.drills
    
    return data.drills.filter((drill) => {
      if (drillFilter.theme && drill.patternTag !== drillFilter.theme) return false
      if (drillFilter.phase) {
        const drillPhase = getPhaseFromPly(drill.ply)
        if (drillPhase !== drillFilter.phase) return false
      }
      return true
    })
  }, [data?.drills, drillFilter])

  const activeDrill = filteredDrills[activeIdx] ?? null

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/blunder-dna/daily')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to load drills')
      setData(json)
      setActiveIdx(0)
      setLastAttemptResult(null)
    } catch (e: any) {
      setError(e?.message || 'Failed to load drills')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh().catch(() => null)
  }, [refresh])

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setShareLoading(true)
      setShareError(null)
      try {
        const res = await fetch('/api/dna/share', { method: 'GET' })
        const json = await res.json().catch(() => ({} as any))
        if (!res.ok) throw new Error(json?.error || 'Failed to load share link')
        const url = typeof json?.share?.url === 'string' ? json.share.url : null
        if (!cancelled) setShareUrl(url)
      } catch (e: any) {
        if (!cancelled) setShareError(e?.message || 'Failed to load share link')
      } finally {
        if (!cancelled) setShareLoading(false)
      }
    }
    load().catch(() => null)
    return () => {
      cancelled = true
    }
  }, [])

  const handleAnalyze = useCallback(async () => {
    setAnalyzing(true)
    setError(null)
    setLastAttemptResult(null)
    try {
      console.log('[Blunder DNA] Starting analysis...')
      const res = await fetch('/api/blunder-dna/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: 50 }),
      })
      const json = await res.json()
      console.log('[Blunder DNA] Response:', { status: res.status, ok: res.ok, json })
      if (!res.ok) {
        const errorMsg = json.error || 'Analysis failed'
        console.error('[Blunder DNA] Analysis failed:', errorMsg)
        throw new Error(errorMsg)
      }
      console.log('[Blunder DNA] Analysis succeeded, refreshing data...')
      // Refresh both daily drills and trigger report refresh
      await refresh()
      // Force refresh the report by triggering a page reload or state update
      // The report component will fetch with force=1 on mount
      window.dispatchEvent(new Event('blunder-dna-updated'))
    } catch (e: any) {
      const errorMsg = e?.message || 'Analysis failed'
      console.error('[Blunder DNA] Error:', errorMsg, e)
      setError(errorMsg)
    } finally {
      setAnalyzing(false)
    }
  }, [refresh])

  useEffect(() => {
    if (didAutoAnalyzeRef.current) return
    if (loading || analyzing) return
    if (!data) return
    if ((data.patterns?.length ?? 0) > 0) return
    if ((data.drills?.length ?? 0) > 0) return
    didAutoAnalyzeRef.current = true
    setTimeout(() => {
      handleAnalyze().catch(() => null)
    }, 0)
  }, [analyzing, data, handleAnalyze, loading])

  // Reset active index when filter changes
  useEffect(() => {
    if (filteredDrills.length > 0 && activeIdx >= filteredDrills.length) {
      setActiveIdx(0)
    }
  }, [filteredDrills.length, activeIdx])

  const patternsSorted = useMemo(() => {
    const list = data?.patterns || []
    return [...list].sort((a, b) => (b.weaknessScore - a.weaknessScore) || (b.occurrences - a.occurrences) || a.patternTag.localeCompare(b.patternTag))
  }, [data?.patterns])

  const handleAttemptMove = useCallback(
    async (from: string, to: string) => {
      if (!activeDrill) return
      const userMove = `${from}${to}`.toLowerCase()
      const best = (activeDrill.bestMove || '').toLowerCase()
      const ok = userMove === best

      setLastAttemptResult(
        ok
          ? { ok: true, message: 'Correct.' }
          : { 
              ok: false, 
              message: `Not quite. Best was ${uciToSan(activeDrill.bestMove, activeDrill.fen)}. PV: ${uciSequenceToSan(activeDrill.pv, activeDrill.fen, 3)}` 
            }
      )
      setCommentaryLoading(true)

      // Record the attempt
      fetch('/api/blunder-dna/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drillId: activeDrill.drillId,
          userMove,
          ok,
        }),
      }).catch(() => null)

      // Fetch commentary
      try {
        const commentaryRes = await fetch('/api/blunder-dna/drill-commentary', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            drillId: activeDrill.drillId,
            fen: activeDrill.fen,
            sideToMove: activeDrill.sideToMove,
            userMove,
            bestMove: activeDrill.bestMove,
            pv: activeDrill.pv,
            evalBefore: activeDrill.evalBefore,
            evalAfter: activeDrill.evalAfter,
            patternTag: activeDrill.patternTag,
            myMove: activeDrill.myMove,
            ok,
            tone,
          }),
        })
        
        if (commentaryRes.ok) {
          const commentaryJson = await commentaryRes.json().catch(() => ({} as any))
          const commentary = typeof commentaryJson.commentary === 'string' ? commentaryJson.commentary : null
          if (commentary) {
            setLastAttemptResult((prev) => prev ? { ...prev, commentary } : null)
          }
        }
      } catch (error) {
        // Silently fail - commentary is optional
        console.warn('[Blunder DNA] Failed to fetch commentary:', error)
      } finally {
        setCommentaryLoading(false)
      }

      if (ok) {
        setTimeout(() => {
            setActiveIdx((i) => Math.min((filteredDrills.length ?? 1) - 1, i + 1))
            setLastAttemptResult(null) // Clear result after moving
            setCommentaryLoading(false)
        }, 3000) // Longer delay to allow reading commentary
      }
      return ok
    },
    [activeDrill, filteredDrills.length, tone]
  )

  const handleCreateShare = useCallback(async () => {
    setShareLoading(true)
    setShareError(null)
    setShareCopied(false)
    try {
      const res = await fetch('/api/dna/share', { method: 'POST' })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok) throw new Error(json?.error || 'Failed to create share link')
      const url = typeof json?.share?.url === 'string' ? json.share.url : null
      setShareUrl(url)
    } catch (e: any) {
      setShareError(e?.message || 'Failed to create share link')
    } finally {
      setShareLoading(false)
    }
  }, [])

  const handleCopyShare = useCallback(async () => {
    if (!shareUrl) return
    setShareCopied(false)
    try {
      await navigator.clipboard.writeText(shareUrl)
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1200)
    } catch {
      setShareCopied(false)
    }
  }, [shareUrl])

  const handleTrainPattern = useCallback((theme: BlunderTheme, phase: GamePhase) => {
    const patternTag = themeToPatternTag(theme)
    setDrillFilter({ theme: patternTag, phase })
    setActiveView('drills')
    setActiveIdx(0)
    setLastAttemptResult(null)
  }, [])

  return (
    <div className="glass-panel p-6 flex flex-col gap-6 min-h-[700px]">
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-xl font-bold text-terracotta tracking-tight">Blunder DNA → Daily Auto‑Drills</h2>
          <div className="mt-1 text-sm text-sage-400">
            Deterministic drills extracted from recent games (audit‑linked to game + ply + FEN).
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="text-xs font-bold text-sage-300 uppercase tracking-widest">
              Share Chess DNA
            </div>
            <button
              onClick={handleCreateShare}
              disabled={shareLoading}
              className="px-3 py-1.5 bg-sage-800 hover:bg-sage-700 text-sage-200 text-sm font-medium rounded-lg border border-white/10 transition-colors disabled:opacity-50"
            >
              {shareLoading ? 'Generating…' : shareUrl ? 'Rotate link' : 'Create link'}
            </button>
            {shareUrl && (
              <>
                <input
                    value={shareUrl}
                    readOnly
                    className="bg-sage-900 border border-sage-700 text-sage-300 text-xs px-3 py-1.5 rounded-lg w-64 focus:outline-none"
                />
                <button
                    onClick={handleCopyShare}
                    disabled={shareLoading}
                    className="px-3 py-1.5 bg-sage-800 hover:bg-sage-700 text-sage-200 text-sm font-medium rounded-lg border border-white/10 transition-colors"
                >
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors border border-purple-500 shadow-lg shadow-purple-900/50"
                >
                  Open
                </a>
              </>
            )}
          </div>
          {shareError && (
            <div className="mt-2 text-rose-400 text-xs font-semibold">{shareError}</div>
          )}
        </div>
        <div className="flex gap-3">
          <button
            onClick={refresh}
            disabled={loading || analyzing}
            className="btn-secondary"
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <FeatureGate feature="blunder_dna">
            <button
              onClick={handleAnalyze}
              disabled={loading || analyzing}
              className="btn-primary bg-purple-600 hover:bg-purple-500 border-purple-500 shadow-purple-900/50"
            >
              {analyzing ? 'Analyzing…' : 'Analyze last 50 games'}
            </button>
          </FeatureGate>
        </div>
      </div>

      {/* View switcher */}
      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setActiveView('drills')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'drills'
              ? 'text-terracotta border-b-2 border-terracotta'
              : 'text-sage-400 hover:text-sage-300'
          }`}
        >
          Daily Drills
        </button>
        <button
          onClick={() => setActiveView('report')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeView === 'report'
              ? 'text-terracotta border-b-2 border-terracotta'
              : 'text-sage-400 hover:text-sage-300'
          }`}
        >
          Blunder Report
        </button>
      </div>

      {activeView === 'report' ? (
        <BlunderDnaReport onTrainPattern={handleTrainPattern} />
      ) : (
        <>
          {error && (
            <div className="bg-rose-900/40 border border-rose-700 text-rose-200 px-4 py-3 rounded-xl text-sm font-medium">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6 items-start">
        <div className="bg-sage-900/40 p-5 rounded-xl border border-white/5">
          <div className="flex justify-between items-center mb-4">
            <div className="font-bold text-lg text-sage-200">Today’s drills</div>
            <div className="text-xs font-mono text-sage-400 bg-sage-900 px-2 py-1 rounded">{data?.date || ''}</div>
          </div>

          {drillFilter && (
            <div className="mb-4 p-3 bg-purple-900/30 border border-purple-700/50 rounded-lg flex items-center justify-between">
              <div className="text-sm text-purple-200">
                Filtered: <strong>{drillFilter.theme}</strong>
                {drillFilter.phase && ` · ${drillFilter.phase}`}
                {' '}({filteredDrills.length} drills)
              </div>
              <button
                onClick={() => {
                  setDrillFilter(null)
                  setActiveIdx(0)
                }}
                className="text-xs text-purple-400 hover:text-purple-300 underline"
              >
                Clear filter
              </button>
            </div>
          )}

          {activeDrill ? (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap justify-between items-center gap-2 bg-sage-900/50 p-3 rounded-lg border border-white/5">
                <div className="text-sm text-sage-300">
                  <span className="text-terracotta font-bold text-lg mr-1">{activeIdx + 1}</span>
                  <span className="text-sage-500 mx-1">/</span>
                  <span className="text-sage-400">{filteredDrills.length || 0}</span>
                  <span className="mx-3 text-sage-600">|</span>
                  <span className="font-bold text-white px-2 py-0.5 rounded bg-white/10">{activeDrill.patternTag}</span>
                  <span className="mx-3 text-sage-600">|</span>
                  <span className="text-sage-400">Diff: {activeDrill.difficulty}</span>
                </div>
                <div className="text-xs text-sage-500 font-mono">
                  Game {activeDrill.lichessGameId} · ply {activeDrill.ply}
                </div>
              </div>

              <div className="flex justify-center bg-sage-800 p-4 rounded-xl shadow-inner border border-white/5">
                <ChessBoard
                    fen={activeDrill.fen}
                    theme="wood"
                    size="min(72vw, 520px)"
                    orientation={activeDrill.sideToMove}
                    isDraggable
                    onMove={handleAttemptMove}
                />
              </div>

              <div className="bg-slate-900 p-4 rounded-xl border border-slate-700 shadow-lg">
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 opacity-80">
                  Evaluation (position before your move)
                </div>
                <div>
                  <EvalGauge evaluationCp={activeDrill.evalBefore} mate={null} />
                </div>
              </div>

              {lastAttemptResult ? (
                <div className="flex flex-col gap-3">
                  <div
                    className={`px-4 py-3 rounded-lg border text-sm font-semibold transition-all ${
                        lastAttemptResult.ok
                        ? 'bg-emerald-900/30 border-emerald-700 text-emerald-300'
                        : 'bg-rose-900/30 border-rose-700 text-rose-300'
                    }`}
                  >
                    {lastAttemptResult.message}
                  </div>
                  {commentaryLoading && (
                    <div className="px-4 py-3 rounded-lg bg-sage-800/40 text-sage-400 text-sm italic">
                      Generating commentary...
                    </div>
                  )}
                  {lastAttemptResult.commentary && !commentaryLoading && (
                    <div className="px-4 py-3 rounded-lg bg-sage-800/60 text-sage-200 text-sm leading-relaxed">
                      {lastAttemptResult.commentary}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sage-400 text-sm italic text-center py-2">
                  Find the best move...
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx <= 0}
                  className="btn-secondary flex-1"
                >
                  Prev
                </button>
                <button
                  onClick={() => setActiveIdx((i) => Math.min((filteredDrills.length ?? 1) - 1, i + 1))}
                  disabled={!filteredDrills.length || activeIdx >= (filteredDrills.length - 1)}
                  className="btn-secondary flex-1"
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div className="py-12 text-center text-sage-500 italic">
              No drills yet. Run “Analyze last 50 games” to generate them.
            </div>
          )}
        </div>

        <div className="bg-sage-900/40 p-5 rounded-xl border border-white/5 h-fit">
          <div className="font-bold text-lg text-sage-200 mb-4">Blunder DNA (patterns)</div>
          <div className="flex flex-col gap-3">
            {patternsSorted.length === 0 ? (
              <div className="text-sage-500 text-sm italic">
                No patterns yet. Run analysis to generate deterministic tags + drills.
              </div>
            ) : (
              patternsSorted.map((p) => (
                <div
                  key={p.patternTag}
                  className="p-3 rounded-xl bg-sage-800/40 border border-white/5 hover:bg-sage-800/60 transition-colors"
                >
                  <div className="flex justify-between gap-3 mb-1">
                    <div className="font-bold text-sage-200 text-sm">{p.label}</div>
                    <div className="text-xs font-medium text-sage-400 bg-sage-900/50 px-2 py-0.5 rounded">{p.occurrences} hits</div>
                  </div>
                  <div className="text-xs text-sage-500">
                    Weakness score: <strong className="text-rose-400">{p.weaknessScore.toFixed(2)}</strong>
                  </div>

                  {/* Visual bar for weakness score */}
                  <div className="mt-2 h-1.5 w-full bg-sage-900 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-orange-500 to-rose-600"
                        style={{ width: `${Math.min(100, (p.weaknessScore / 10) * 100)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
        </>
      )}
    </div>
  )
}
