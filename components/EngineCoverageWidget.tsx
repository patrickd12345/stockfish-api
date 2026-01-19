'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

type CoverageSnapshot = {
  totalGames: number
  analyzedGames: number
  failedGames: number
  pendingGames: number
}

type CoverageResponse = {
  ok: true
  engineName: string
  analysisDepth: number
  coverage: CoverageSnapshot
  updatedAt: string
}

export default function EngineCoverageWidget({
  analysisDepth,
  active = false,
  compact = false,
}: {
  analysisDepth?: number
  active?: boolean
  compact?: boolean
}) {
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const abortRef = useRef<AbortController | null>(null)

  const pollMs = active ? 2500 : 15000

  const url = useMemo(() => {
    const params = new URLSearchParams()
    if (typeof analysisDepth === 'number') params.set('analysisDepth', String(analysisDepth))
    const qs = params.toString()
    return qs ? `/api/engine/coverage?${qs}` : '/api/engine/coverage'
  }, [analysisDepth])

  useEffect(() => {
    let mounted = true
    let timeout: number | null = null

    const run = async () => {
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const res = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: { 'Accept': 'application/json' },
        })
        const json = (await res.json().catch(() => null)) as CoverageResponse | { error?: string } | null

        if (!mounted) return

        if (!res.ok || !json || (json as any).ok !== true) {
          setError((json as any)?.error || 'Coverage unavailable')
          setIsLoading(false)
        } else {
          setData(json as CoverageResponse)
          setError(null)
          setIsLoading(false)
        }
      } catch (e: any) {
        if (!mounted) return
        if (e?.name === 'AbortError') return
        setError(e?.message || 'Coverage unavailable')
        setIsLoading(false)
      } finally {
        if (!mounted) return
        timeout = window.setTimeout(run, pollMs)
      }
    }

    run()
    return () => {
      mounted = false
      if (timeout) window.clearTimeout(timeout)
      abortRef.current?.abort()
    }
  }, [pollMs, url])

  const coverage = data?.coverage
  const done = coverage ? coverage.analyzedGames + coverage.failedGames : 0
  const pct = coverage && coverage.totalGames > 0 ? (done / coverage.totalGames) * 100 : 0
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null

  if (isLoading && !data) {
    return (
      <div
        style={{
          border: '1px solid #e5e7eb',
          background: '#ffffff',
          borderRadius: '12px',
          padding: compact ? '8px 10px' : '12px 14px',
          minWidth: compact ? 220 : 260,
        }}
      >
        <div style={{ color: '#6b7280', fontSize: '12px', fontWeight: 800 }}>Engine progress</div>
        <div style={{ marginTop: '6px', height: '8px', borderRadius: '999px', background: '#f3f4f6' }} />
        <div style={{ marginTop: '8px', color: '#9ca3af', fontSize: '12px' }}>Loading…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div
        style={{
          border: '1px solid #fee2e2',
          background: '#fff1f2',
          borderRadius: '12px',
          padding: compact ? '8px 10px' : '12px 14px',
          minWidth: compact ? 220 : 260,
          color: '#991b1b',
          fontSize: '12px',
          fontWeight: 700,
        }}
      >
        Engine progress unavailable
      </div>
    )
  }

  if (!coverage) return null

  return (
    <div
      style={{
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        borderRadius: '12px',
        padding: compact ? '8px 10px' : '12px 14px',
        minWidth: compact ? 220 : 260,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '10px' }}>
        <div style={{ color: '#111827', fontSize: '12px', fontWeight: 900 }}>Engine progress</div>
        <div style={{ color: '#6b7280', fontSize: '12px' }}>{pct.toFixed(1)}%</div>
      </div>

      <div
        style={{
          marginTop: '6px',
          height: '8px',
          borderRadius: '999px',
          background: '#f3f4f6',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${Math.max(0, Math.min(100, pct))}%`,
            background: '#7c3aed',
          }}
        />
      </div>

      <div
        style={{
          marginTop: '8px',
          display: 'grid',
          gridTemplateColumns: compact ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))',
          gap: '8px',
          fontSize: '12px',
        }}
      >
        <Stat label="Total" value={coverage.totalGames} />
        <Stat label="Analyzed" value={coverage.analyzedGames} />
        {compact ? null : <Stat label="Failed" value={coverage.failedGames} />}
        <Stat label={compact ? 'Pending' : 'Pending'} value={coverage.pendingGames} />
      </div>

      {updatedAt ? (
        <div style={{ marginTop: '8px', color: '#9ca3af', fontSize: '11px' }}>
          Updated {updatedAt.toLocaleTimeString()}
        </div>
      ) : null}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <div style={{ color: '#6b7280', fontWeight: 800 }}>{label}</div>
      <div style={{ color: '#111827', fontWeight: 900 }}>{value.toLocaleString()}</div>
    </div>
  )
}

