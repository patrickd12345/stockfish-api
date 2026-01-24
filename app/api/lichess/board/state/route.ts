import { NextRequest, NextResponse } from 'next/server'
import { getActiveGameState } from '@/lib/lichess/sessionManager'
import { startBoardSession } from '@/lib/lichess/sessionService'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json(null, { status: 200 })
  }
  try {
    await requireLichessLiveAccess(request)
  } catch (error) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }

  // Best-effort: ensure the background stream is running whenever we poll state.
  // We don't await this to keep the polling route fast.
  startBoardSession(lichessUserId).catch((err) => {
    console.warn('[Lichess State] Failed to auto-start board session:', err)
  })

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
    myColor: state.myColor,
    opponentName: state.opponentName,
    opponentRating: state.opponentRating,
    initialTimeMs: state.initialTimeMs,
    initialIncrementMs: state.initialIncrementMs,
    chatMessages: state.chatMessages,
    lastClockUpdateAt: state.lastClockUpdateAt ? state.lastClockUpdateAt.toISOString() : null
  })
}
