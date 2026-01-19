import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { interpolateClock } from '@/lib/lichess/clockSync'
import { ClockSnapshot } from '@/lib/lichess/types'

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
  const [state, setState] = useState<LichessBoardState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [clockTick, setClockTick] = useState(0)
  const snapshotRef = useRef<ClockSnapshot | null>(null)

  const refreshState = useCallback(async () => {
    try {
      const response = await fetch('/api/lichess/board/state')
      if (!response.ok) {
        throw new Error(`Failed to fetch state: ${response.status}`)
      }
      const payload = (await response.json()) as LichessBoardState | null
      setState(payload)
      if (payload) {
        snapshotRef.current = {
          wtime: payload.wtime,
          btime: payload.btime,
          winc: payload.winc,
          binc: payload.binc,
          receivedAt: Date.now()
        }
      }
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch board state')
    }
  }, [])

  useEffect(() => {
    refreshState().catch(() => null)
    const interval = setInterval(() => {
      refreshState().catch(() => null)
    }, pollIntervalMs)
    return () => clearInterval(interval)
  }, [pollIntervalMs, refreshState])

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
