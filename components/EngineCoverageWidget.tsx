'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useExecutionMode } from '@/contexts/ExecutionModeContext'
import { serverAnalysisFetch } from '@/lib/serverAnalysisFetch'

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

type QueueStats = {
  total: number
  pending: number
  processing: number
  done: number
  failed: number
  staleProcessing: number
}

type QueueDiagnosticsResponse = {
  ok: true
  engineName: string
  analysisDepth: number
  stats: QueueStats
  requeued?: { requeued: number }
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
  const executionMode = useExecutionMode()
  const [data, setData] = useState<CoverageResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [queue, setQueue] = useState<QueueDiagnosticsResponse | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [isResuming, setIsResuming] = useState(false)
  const [resumeError, setResumeError] = useState<string | null>(null)
  const [resumeNote, setResumeNote] = useState<string | null>(null)
  const prevDoneRef = useRef<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  const pollMs = active ? 2500 : 15000

  const coverageUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (typeof analysisDepth === 'number') params.set('analysisDepth', String(analysisDepth))
    const qs = params.toString()
    return qs ? `/api/engine/coverage?${qs}` : '/api/engine/coverage'
  }, [analysisDepth])

  const queueUrl = useMemo(() => {
    const params = new URLSearchParams()
    if (typeof analysisDepth === 'number') params.set('analysisDepth', String(analysisDepth))
    params.set('engineName', 'stockfish')
    const qs = params.toString()
    return `/api/engine/queue/diagnostics?${qs}`
  }, [analysisDepth])

  useEffect(() => {
    if (executionMode !== 'server') return
    let mounted = true
    let timeout: number | null = null

    const run = async () => {
      if (executionMode !== 'server') return
      abortRef.current?.abort()
      const controller = new AbortController()
      abortRef.current = controller

      try {
        const [coverageRes, queueRes] = await Promise.all([
          fetch(coverageUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }),
          fetch(queueUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { Accept: 'application/json' },
          }).catch(() => null),
        ])

        const coverageJson = (await coverageRes.json().catch(() => null)) as CoverageResponse | { error?: string } | null
        const queueJson = queueRes
          ? ((await queueRes.json().catch(() => null)) as QueueDiagnosticsResponse | { error?: string } | null)
          : null

        if (!mounted) return

        if (!coverageRes.ok || !coverageJson || (coverageJson as any).ok !== true) {
          setError((coverageJson as any)?.error || 'Coverage unavailable')
          setIsLoading(false)
        } else {
          setData(coverageJson as CoverageResponse)
          setError(null)
          setIsLoading(false)
        }

        if (queueRes && queueJson && (queueJson as any).ok === true) {
          setQueue(queueJson as QueueDiagnosticsResponse)
          setQueueError(null)
        } else if (queueRes && queueRes.ok === false) {
          setQueueError((queueJson as any)?.error || 'Queue unavailable')
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
  }, [coverageUrl, pollMs, queueUrl, executionMode])

  const coverage = data?.coverage
  const done = coverage ? coverage.analyzedGames + coverage.failedGames : 0
  const pctRaw = coverage && coverage.totalGames > 0 ? (done / coverage.totalGames) * 100 : 0
  const pct = Math.max(0, Math.min(100, pctRaw))
  const updatedAt = data?.updatedAt ? new Date(data.updatedAt) : null
  const queueStats = queue?.stats ?? null

  const jobStatus = useMemo(() => {
    if (!coverage) return null
    const s = queueStats
    const pendingCoverage = coverage.pendingGames

    if (!s) {
      // Fall back to coarse status when the queue diagnostics endpoint isn't available.
      if (pendingCoverage > 0) return 'Pending (not queued)'
      return 'Idle'
    }

    if (s.staleProcessing > 0) return `Stalled (${s.staleProcessing} stuck)`
    if (s.processing > 0) return `Processing (${s.processing} running)`
    if (s.pending > 0) return `Queued (${s.pending} pending)`
    if (pendingCoverage > 0) return 'Pending (not queued)'
    return 'Idle'
  }, [coverage, queueStats])

  const activityHint = useMemo(() => {
    if (!coverage) return null
    const prev = prevDoneRef.current
    if (prev === null) return null
    const delta = done - prev
    if (delta > 0) return `+${delta} since last update`
    return null
  }, [coverage, done])

  useEffect(() => {
    if (!coverage) return
    prevDoneRef.current = done
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.updatedAt])

  const handleResume = async () => {
    if (isResuming) return
    if (executionMode !== 'server') return
    setIsResuming(true)
    setQueueError(null)
    setResumeError(null)
    setResumeNote(null)
    try {
      const depth = typeof analysisDepth === 'number' ? analysisDepth : undefined

      let totalEnqueued = 0
      for (let i = 0; i < 25; i++) {
        const res = await serverAnalysisFetch(
          '/api/engine/analyze',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: 'enqueue', limit: 25, analysisDepth: depth }),
          },
          executionMode
        )
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          throw new Error(json?.error || 'Engine enqueue failed')
        }
        const enq = typeof json?.enqueued === 'number' ? json.enqueued : 0
        totalEnqueued += enq
        if (enq <= 0) break
        await new Promise((r) => setTimeout(r, 100))
      }

      // 2) Requeue stale processing jobs (if any)
      const requeueRes = await fetch(`${queueUrl}&requeue=true`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      })
      const requeueJson = (await requeueRes.json().catch(() => null)) as QueueDiagnosticsResponse | { error?: string } | null
      if (requeueRes.ok && requeueJson && (requeueJson as any).ok === true) {
        setQueue(requeueJson as QueueDiagnosticsResponse)
      }

      // 3) Drain the queue in a bounded loop.
      let totalProcessed = 0
      let totalSucceeded = 0
      let totalFailed = 0
      let totalAutoEnqueued = 0
      for (let i = 0; i < 200; i++) {
        const res = await serverAnalysisFetch(
          '/api/engine/analyze/worker',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 10, analysisDepth: depth }),
          },
          executionMode
        )
        const json = (await res.json().catch(() => null)) as any
        if (!res.ok) {
          throw new Error(json?.error || 'Engine worker failed')
        }
        const processed = typeof json?.processed === 'number' ? json.processed : 0
        const succeeded = typeof json?.succeeded === 'number' ? json.succeeded : 0
        const failed = typeof json?.failed === 'number' ? json.failed : 0
        const autoEnqueued = typeof json?.autoEnqueued === 'number' ? json.autoEnqueued : 0
        totalProcessed += processed
        totalSucceeded += succeeded
        totalFailed += failed
        totalAutoEnqueued += autoEnqueued
        if (processed <= 0) break
        await new Promise((r) => setTimeout(r, 50))
      }

      setResumeNote(
        `Enqueued ${totalEnqueued.toLocaleString()}, processed ${totalProcessed.toLocaleString()} ` +
          `(ok ${totalSucceeded.toLocaleString()}, failed ${totalFailed.toLocaleString()}, auto-enq ${totalAutoEnqueued.toLocaleString()}).`
      )
    } catch (e: any) {
      setResumeError(e?.message || 'Failed to resume')
    } finally {
      setIsResuming(false)
    }
  }

  if (executionMode === 'local') {
    return (
      <div
        className={`border border-white/5 bg-sage-800/50 rounded-xl ${compact ? 'p-2 min-w-[220px]' : 'p-3 min-w-[260px]'}`}
        title="Server analysis disabled (local mode)"
      >
        <div className="text-sage-400 text-xs font-bold">Engine: local only</div>
        <div className="mt-1 text-sage-500 text-[11px]">Server analysis off in this mode.</div>
      </div>
    )
  }

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
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold text-sage-400">
          Status:{' '}
          <span className={jobStatus?.startsWith('Stalled') ? 'text-amber-300' : 'text-sage-200'}>
            {jobStatus ?? '—'}
          </span>
          {activityHint ? <span className="ml-2 text-sage-500 font-normal">({activityHint})</span> : null}
        </div>
        <button
          type="button"
          onClick={handleResume}
          disabled={isResuming || executionMode !== 'server'}
          className="px-2 py-1 rounded-md text-[11px] font-bold border border-white/10 bg-sage-900/40 text-sage-200 hover:bg-sage-900/60 disabled:opacity-50"
          title={executionMode !== 'server' ? 'Server analysis disabled (local mode)' : undefined}
        >
          {isResuming ? 'Resuming…' : executionMode === 'server' ? 'Resume' : 'Local only'}
        </button>
      </div>

      {resumeError && (
        <div className="mt-2 text-[10px] text-rose-300 font-bold">
          Resume failed: {resumeError}
        </div>
      )}
      {resumeNote && !resumeError && (
        <div className="mt-2 text-[10px] text-sage-400 font-bold">
          {resumeNote}
        </div>
      )}

      <div className={`mt-2 grid gap-2 text-xs ${compact ? 'grid-cols-2' : 'grid-cols-4'}`}>
        <Stat label="Total" value={coverage.totalGames} />
        <Stat label="Analyzed" value={coverage.analyzedGames} />
        {!compact && <Stat label="Failed" value={coverage.failedGames} />}
        <Stat label="Pending" value={coverage.pendingGames} />
      </div>

      {queueStats && !compact && (
        <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
          <Stat label="Q Pending" value={queueStats.pending} />
          <Stat label="Q Proc" value={queueStats.processing} />
          <Stat label="Q Done" value={queueStats.done} />
          <Stat label="Q Failed" value={queueStats.failed} />
        </div>
      )}

      {queueError && (
        <div className="mt-2 text-[10px] text-rose-300 font-bold">
          Queue status unavailable: {queueError}
        </div>
      )}

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
