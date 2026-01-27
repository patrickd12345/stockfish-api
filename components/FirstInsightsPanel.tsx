'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'

type Evidence = {
  gameId: string
  ply: number
  moveNumber?: number
  playedMove?: string
  bestMove?: string | null
  metricLabel?: string
  metricValue?: number
}

type Insight = {
  id: string
  title: string
  detail: string
  evidence: Evidence[]
}

type ApiResponse = {
  ok: boolean
  ready: boolean
  reason?: string
  errorCode?: 'db_quota' | 'db_error' | string
  retryable?: boolean
  nextPollMs?: number
  minAnalyzedGames?: number
  analysisDepth?: number
  coverage?: { totalGames: number; analyzedGames: number; failedGames: number; pendingGames: number }
  insights: Insight[]
  generatedAt?: string
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function safeInt(n: unknown): number | null {
  const v = Number(n)
  return Number.isFinite(v) ? Math.trunc(v) : null
}

function buildInspectorHref(gameId: string, ply: number) {
  const params = new URLSearchParams()
  params.set('tab', 'replay')
  params.set('gameId', gameId)
  params.set('ply', String(Math.max(0, Math.trunc(ply))))
  return `/?${params.toString()}`
}

function ServerFirstInsightsPanel() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshTick, setRefreshTick] = useState(0)
  const abortRef = useRef<AbortController | null>(null)

  const analyzed = data?.coverage?.analyzedGames ?? 0
  const total = data?.coverage?.totalGames ?? 0
  const min = data?.minAnalyzedGames ?? 20

  const insights = useMemo(() => (Array.isArray(data?.insights) ? data!.insights : []), [data])

  const fetchWithRetry = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)

    // Retry/backoff while analysis is in-flight (or transient network issues).
    let delay = 600
    for (let attempt = 0; attempt < 7; attempt++) {
      try {
        const res = await fetch('/api/insights/first', { signal: controller.signal })
        const json = (await res.json().catch(() => null)) as ApiResponse | null
        if (!res.ok || !json) {
          throw new Error((json as any)?.reason || (json as any)?.error || 'Failed to load first insights')
        }

        setData(json)
        setLoading(false)

        // If not ready yet, keep polling gently (backoff) so the panel "pops" when done.
        if (!json.ready) {
          // Stop polling on non-retryable states (e.g., DB quota exceeded).
          if (json.retryable === false) return

          // Only poll when analysis is actively pending; otherwise wait for a manual refresh.
          const pending = (json.coverage?.pendingGames ?? 0) > 0
          if (!pending) return

          const nextMs = typeof json.nextPollMs === 'number' && Number.isFinite(json.nextPollMs) && json.nextPollMs > 0 ? json.nextPollMs : delay
          await sleep(nextMs)
          delay = Math.min(12_000, Math.round(delay * 1.75))
          continue
        }
        return
      } catch (e: any) {
        if (controller.signal.aborted) return
        const msg = e?.message || 'Failed to load first insights'
        // If we have a prior payload, keep it and just stop polling.
        setError(msg)
        setLoading(false)
        return
      }
    }
  }, [])

  useEffect(() => {
    fetchWithRetry().catch(() => null)
    return () => abortRef.current?.abort()
  }, [fetchWithRetry, refreshTick])

  const handleRefresh = useCallback(() => {
    setRefreshTick((x) => x + 1)
  }, [])

  const showPanel = loading || !!error || (data?.ready && insights.length > 0) || (!data?.ready && (total > 0 || analyzed > 0))
  if (!showPanel) return null

  return (
    <div
      style={{
        marginBottom: '16px',
        padding: '14px',
        borderRadius: '12px',
        border: '1px solid #e5e7eb',
        background: '#ffffff',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 900, color: '#111827' }}>First Insights (with proof)</div>
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#6b7280' }}>
            {loading
              ? 'Loading…'
              : data?.ready
                ? `Based on ${analyzed} analyzed games`
                : `Waiting for analysis: ${analyzed}/${min} analyzed`}
          </div>
        </div>
        <button
          type="button"
          className="button"
          onClick={handleRefresh}
          disabled={loading}
          style={{ padding: '8px 10px' }}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div style={{ marginTop: '10px', padding: '10px 12px', borderRadius: '10px', background: '#fff1f2', border: '1px solid #fecaca', color: '#9f1239', fontSize: '13px' }}>
          {error}
        </div>
      ) : null}

      {!error && !loading && data?.reason && !data?.ready ? (
        <div
          style={{
            marginTop: '10px',
            padding: '10px 12px',
            borderRadius: '10px',
            background: data?.errorCode === 'db_quota' ? '#fffbeb' : '#f3f4f6',
            border: data?.errorCode === 'db_quota' ? '1px solid #fcd34d' : '1px solid #e5e7eb',
            color: '#374151',
            fontSize: '13px',
          }}
        >
          {data.reason}
        </div>
      ) : null}

      {!data?.ready && !loading ? (
        <div style={{ marginTop: '10px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '12px', color: '#374151', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '6px 10px', borderRadius: '999px' }}>
            Total games: {total}
          </div>
          <div style={{ fontSize: '12px', color: '#374151', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '6px 10px', borderRadius: '999px' }}>
            Pending: {data?.coverage?.pendingGames ?? 0}
          </div>
          <div style={{ fontSize: '12px', color: '#374151', background: '#f3f4f6', border: '1px solid #e5e7eb', padding: '6px 10px', borderRadius: '999px' }}>
            Failed: {data?.coverage?.failedGames ?? 0}
          </div>
        </div>
      ) : null}

      {data?.ready && insights.length > 0 ? (
        <div style={{ marginTop: '12px', display: 'grid', gap: '10px' }}>
          {insights.map((insight) => {
            const ev = insight.evidence?.[0]
            const ply = safeInt(ev?.ply) ?? 0
            const href = ev?.gameId ? buildInspectorHref(ev.gameId, ply) : null
            const citeLabel = ev?.gameId
              ? `Game ${String(ev.gameId).slice(0, 8)}… · ply ${ply}${Number.isFinite(Number(ev?.moveNumber)) ? ` · move ${Math.trunc(Number(ev?.moveNumber))}` : ''}`
              : 'Missing citation'

            return (
              <div key={insight.id} style={{ padding: '10px 12px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ fontWeight: 900, color: '#111827' }}>{insight.title}</div>
                  {href ? (
                    <a
                      href={href}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') (e.currentTarget as HTMLAnchorElement).click()
                      }}
                      className="button"
                      style={{ padding: '6px 10px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      Open proof
                    </a>
                  ) : null}
                </div>
                <div style={{ marginTop: '6px', color: '#111827', fontSize: '13px' }}>{insight.detail}</div>
                <div style={{ marginTop: '8px', color: '#6b7280', fontSize: '12px' }}>{citeLabel}</div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

export default function FirstInsightsPanel() {
  const access = useFeatureAccess('first_insights')

  if (!access.allowed) {
    return null
  }

  return <ServerFirstInsightsPanel />
}