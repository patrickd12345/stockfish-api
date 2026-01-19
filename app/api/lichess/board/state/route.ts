import { NextRequest, NextResponse } from 'next/server'
import { getActiveGameState } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json(null, { status: 200 })
  }

  const state = await getActiveGameState(lichessUserId)
  if (!state) {
    return NextResponse.json(null, { status: 200 })
  }

  return NextResponse.json({
    gameId: state.gameId,
    fen: state.fen,
    moves: state.moves,
    status: state.status,
    wtime: state.wtime,
    btime: state.btime,
    winc: state.winc,
    binc: state.binc,
    winner: state.winner,
    lastClockUpdateAt: state.lastClockUpdateAt ? state.lastClockUpdateAt.toISOString() : null
  })
}
