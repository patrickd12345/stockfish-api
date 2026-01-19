import { ClockSnapshot } from '@/lib/lichess/types'

export interface DisplayClock {
  wtime: number
  btime: number
}

export function interpolateClock(snapshot: ClockSnapshot, now: number = Date.now()): DisplayClock {
  if (!snapshot.isRunning || !snapshot.activeColor) {
    return { wtime: snapshot.wtime, btime: snapshot.btime }
  }

  const elapsed = Math.max(0, now - snapshot.receivedAt)
  if (snapshot.activeColor === 'white') {
    return {
      wtime: Math.max(0, snapshot.wtime - elapsed),
      btime: snapshot.btime
    }
  }

  return {
    wtime: snapshot.wtime,
    btime: Math.max(0, snapshot.btime - elapsed)
  }
}
