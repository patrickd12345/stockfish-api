import { ClockSnapshot } from '@/lib/lichess/types'

export interface DisplayClock {
  wtime: number
  btime: number
}

export function interpolateClock(snapshot: ClockSnapshot, now: number = Date.now()): DisplayClock {
  const elapsed = Math.max(0, now - snapshot.receivedAt)
  return {
    wtime: Math.max(0, snapshot.wtime - elapsed),
    btime: Math.max(0, snapshot.btime - elapsed)
  }
}
