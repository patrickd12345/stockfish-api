import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { interpolateClock } from '@/lib/lichess/clockSync'
import { ClockSnapshot } from '@/lib/lichess/types'
import { useFeatureAccess } from '@/hooks/useFeatureAccess'

export interface LichessBoardState {
  gameId: string
  lichessUserId: string
  fen: string
  moves: string
  status: string
  wtime: number
  btime: number
  winc: number
  binc: number
  winner?: 'white' | 'black'
  myColor?: 'white' | 'black'
  opponentName?: string | null
  opponentRating?: number | null
  initialTimeMs?: number | null
  initialIncrementMs?: number | null
  lastClockUpdateAt?: string | null
  chatMessages?: Array<{
    username: string
    text: string
    room: string
    receivedAt: string
  }>
}

export function useLichessBoard(pollIntervalMs: number = 2000) {
  const access = useFeatureAccess('lichess_live')
  const [state, setState] = useState<LichessBoardState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const snapshotRef = useRef<ClockSnapshot | null>(null)

  const refreshState = useCallback(async () => {
    try {
      if (!access.allowed) {
        setState(null)
        setError(null)
        return
      }
      const response = await fetch('/api/lichess/board/state')
      if (!response.ok) {
        throw new Error(`Failed to fetch state: ${response.status}`)
      }
      const payload = (await response.json()) as LichessBoardState | null
      setState(payload)
      if (payload) {
        const fenParts = (payload.fen || '').split(' ')
        const turnToken = fenParts[1]
        const activeColor = turnToken === 'w' ? 'white' : turnToken === 'b' ? 'black' : null
        const isRunning = payload.status === 'started' || payload.status === 'playing'
        const prev = snapshotRef.current

        // Only reset the interpolation anchor when the clock actually updates.
        // Otherwise we keep the previous receivedAt so the countdown stays smooth between polls.
        const clockChanged =
          !prev ||
          prev.wtime !== payload.wtime ||
          prev.btime !== payload.btime ||
          prev.lastClockUpdateAt !== (payload.lastClockUpdateAt ?? null)

        snapshotRef.current = {
          wtime: payload.wtime,
          btime: payload.btime,
          winc: payload.winc,
          binc: payload.binc,
          receivedAt: clockChanged ? Date.now() : prev.receivedAt,
          activeColor,
          isRunning,
          lastClockUpdateAt: payload.lastClockUpdateAt ?? null
        }
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch board state')
    }
  }, [access.allowed])

  useEffect(() => {
    if (!access.allowed) {
      setState(null)
      setError(null)
      return
    }
    refreshState().catch(() => null)
    const interval = setInterval(() => {
      refreshState().catch(() => null)
    }, pollIntervalMs)
    return () => clearInterval(interval)
  }, [access.allowed, pollIntervalMs, refreshState])

  useEffect(() => {
    const interval = setInterval(() => {
      setClockTick((tick) => tick + 1)
    }, 250)
    return () => clearInterval(interval)
  }, [])

  const displayClock = useMemo(() => {
    if (!snapshotRef.current) return null
    return interpolateClock(snapshotRef.current)
  }, [clockTick, state])

  return {
    state,
    displayClock,
    error,
    refreshState
  }
}
