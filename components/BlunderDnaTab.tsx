'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ChessBoard from '@/components/ChessBoard'
import EvalGauge from '@/components/EvalGauge'

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

export default function BlunderDnaTab() {
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [data, setData] = useState<DailyDrillsResponse | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [lastAttemptResult, setLastAttemptResult] = useState<{ ok: boolean; message: string } | null>(null)
  const didAutoAnalyzeRef = useRef(false)

  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [shareLoading, setShareLoading] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [shareCopied, setShareCopied] = useState(false)

  const activeDrill = data?.drills?.[activeIdx] ?? null

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
      const res = await fetch('/api/blunder-dna/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ n: 50 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Analysis failed')
      await refresh()
    } catch (e: any) {
      setError(e?.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }, [refresh])

  useEffect(() => {
    // Proactive UX: if this is the first time opening the tab and nothing exists yet,
    // run one deterministic analysis automatically.
    if (didAutoAnalyzeRef.current) return
    if (loading || analyzing) return
    if (!data) return
    if ((data.patterns?.length ?? 0) > 0) return
    if ((data.drills?.length ?? 0) > 0) return
    didAutoAnalyzeRef.current = true
    setTimeout(() => {
      // avoid blocking initial paint
      handleAnalyze().catch(() => null)
    }, 0)
  }, [analyzing, data, handleAnalyze, loading])

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
          : { ok: false, message: `Not quite. Best was ${activeDrill.bestMove}. PV: ${activeDrill.pv}` }
      )

      // Fire-and-forget attempt record (deterministic scoring handled server-side too).
      fetch('/api/blunder-dna/attempt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          drillId: activeDrill.drillId,
          userMove,
          ok,
        }),
      }).catch(() => null)

      // Advance automatically on correct, otherwise stay for retry/review.
      if (ok) {
        setActiveIdx((i) => Math.min((data?.drills?.length ?? 1) - 1, i + 1))
      }
      return ok
    },
    [activeDrill, data?.drills?.length]
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

  return (
    <div className="card" style={{ minHeight: '700px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ margin: 0 }}>Blunder DNA → Daily Auto‑Drills</h2>
          <div style={{ marginTop: '6px', color: '#6b7280', fontSize: '13px' }}>
            Deterministic drills extracted from recent games (audit‑linked to game + ply + FEN).
          </div>
          <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '12px', color: '#6b7280', fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Share Chess DNA
            </div>
            <button
              className="button"
              onClick={handleCreateShare}
              disabled={shareLoading}
              style={{ background: '#111827', padding: '8px 12px', fontSize: '14px' }}
            >
              {shareLoading ? 'Generating…' : shareUrl ? 'Rotate link' : 'Create link'}
            </button>
            {shareUrl ? (
              <>
                <input className="input" value={shareUrl} readOnly style={{ width: 'min(520px, 78vw)', marginBottom: 0, fontSize: '13px' }} />
                <button className="button" onClick={handleCopyShare} disabled={shareLoading} style={{ padding: '8px 12px', fontSize: '14px' }}>
                  {shareCopied ? 'Copied' : 'Copy'}
                </button>
                <a
                  className="button"
                  href={shareUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ background: '#7c3aed', padding: '8px 12px', fontSize: '14px' }}
                >
                  Open
                </a>
              </>
            ) : null}
          </div>
          {shareError ? (
            <div style={{ marginTop: '8px', color: '#b91c1c', fontSize: '13px' }}>{shareError}</div>
          ) : null}
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="button" onClick={refresh} disabled={loading || analyzing}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
          <button className="button" onClick={handleAnalyze} disabled={loading || analyzing} style={{ background: '#7c3aed' }}>
            {analyzing ? 'Analyzing…' : 'Analyze last 50 games'}
          </button>
        </div>
      </div>

      {error ? (
        <div style={{ padding: '12px 16px', background: '#fee2e2', color: '#b91c1c', borderRadius: '8px', fontSize: '14px', border: '1px solid #fecaca' }}>
          {error}
        </div>
      ) : null}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '16px', alignItems: 'stretch' }}>
        <div className="card" style={{ padding: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 800, color: '#111827' }}>Today’s drills</div>
            <div style={{ fontSize: '12px', color: '#6b7280' }}>{data?.date || ''}</div>
          </div>

          {activeDrill ? (
            <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', color: '#374151' }}>
                  <strong>{activeIdx + 1}</strong> / {data?.drills?.length || 0} · <strong>{activeDrill.patternTag}</strong> · diff {activeDrill.difficulty}
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                  Game {activeDrill.lichessGameId} · ply {activeDrill.ply}
                </div>
              </div>

              <ChessBoard
                fen={activeDrill.fen}
                theme="wood"
                size="min(72vw, 520px)"
                orientation={activeDrill.sideToMove}
                isDraggable
                onMove={handleAttemptMove}
              />

              <div
                className="card"
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  border: '1px solid #e5e7eb',
                  background: '#0f172a',
                  color: '#f8fafc'
                }}
              >
                <div style={{ fontSize: '12px', fontWeight: 900, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.9 }}>
                  Evaluation (position before your move)
                </div>
                <div style={{ marginTop: '8px' }}>
                  <EvalGauge evaluationCp={activeDrill.evalBefore} mate={null} />
                </div>
              </div>

              {lastAttemptResult ? (
                <div
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: `1px solid ${lastAttemptResult.ok ? '#86efac' : '#fecaca'}`,
                    background: lastAttemptResult.ok ? '#ecfdf5' : '#fff1f2',
                    color: lastAttemptResult.ok ? '#065f46' : '#9f1239',
                    fontSize: '13px'
                  }}
                >
                  {lastAttemptResult.message}
                </div>
              ) : (
                <div style={{ color: '#6b7280', fontSize: '13px' }}>
                  Play the best move (click‑to‑move or drag).
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  className="button"
                  onClick={() => setActiveIdx((i) => Math.max(0, i - 1))}
                  disabled={activeIdx <= 0}
                  style={{ background: '#374151' }}
                >
                  Prev
                </button>
                <button
                  className="button"
                  onClick={() => setActiveIdx((i) => Math.min((data?.drills?.length ?? 1) - 1, i + 1))}
                  disabled={!data?.drills?.length || activeIdx >= (data.drills.length - 1)}
                  style={{ background: '#374151' }}
                >
                  Next
                </button>
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '16px', color: '#6b7280' }}>
              No drills yet. Run “Analyze last 50 games”.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: '14px' }}>
          <div style={{ fontWeight: 800, color: '#111827' }}>Blunder DNA (patterns)</div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {patternsSorted.length === 0 ? (
              <div style={{ color: '#6b7280', fontSize: '13px' }}>
                No patterns yet. Run analysis to generate deterministic tags + drills.
              </div>
            ) : (
              patternsSorted.map((p) => (
                <div
                  key={p.patternTag}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    background: '#f9fafb',
                    border: '1px solid #e5e7eb'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>{p.label}</div>
                    <div style={{ fontSize: '12px', color: '#6b7280' }}>{p.occurrences} hits</div>
                  </div>
                  <div style={{ marginTop: '6px', fontSize: '12px', color: '#374151' }}>
                    Weakness score: <strong>{p.weaknessScore.toFixed(2)}</strong>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

