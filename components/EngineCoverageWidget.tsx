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
      <div className={`border border-white/5 bg-sage-800/50 rounded-xl ${compact ? 'p-2 min-w-[220px]' : 'p-3 min-w-[260px]'}`}>
        <div className="text-sage-400 text-xs font-bold">Engine progress</div>
        <div className="mt-2 h-2 rounded-full bg-sage-700 animate-pulse" />
        <div className="mt-2 text-sage-500 text-xs">Loading…</div>
      </div>
    )
  }

  if (error && !data) {
    return (
      <div className={`border border-rose-900/50 bg-rose-900/20 rounded-xl ${compact ? 'p-2 min-w-[220px]' : 'p-3 min-w-[260px]'} text-rose-300 text-xs font-bold`}>
        Engine progress unavailable
      </div>
    )
  }

  if (!coverage) return null

  return (
    <div className={`border border-white/5 bg-sage-800/50 backdrop-blur-sm rounded-xl ${compact ? 'p-2 min-w-[220px]' : 'p-3 min-w-[260px]'} shadow-sm`}>
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-sage-300 text-xs font-bold">Engine progress</div>
        <div className="text-sage-400 text-xs">{pct.toFixed(1)}%</div>
      </div>

      <div className="mt-1.5 h-2 rounded-full bg-sage-900 overflow-hidden border border-white/5">
        <div
          className="h-full bg-ochre transition-all duration-500 ease-out"
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>

      <div className={`mt-2 grid gap-2 text-xs ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}>
        <Stat label="Total" value={coverage.totalGames} />
        <Stat label="Analyzed" value={coverage.analyzedGames} />
        {!compact && <Stat label="Failed" value={coverage.failedGames} />}
        <Stat label="Pending" value={coverage.pendingGames} />
      </div>

      {updatedAt && (
        <div className="mt-2 text-sage-500 text-[10px] text-right">
          Updated {updatedAt.toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col">
      <div className="text-sage-500 font-bold text-[10px] uppercase tracking-wide">{label}</div>
      <div className="text-sage-200 font-bold">{value.toLocaleString()}</div>
    </div>
  )
}
