import { NextRequest, NextResponse } from 'next/server'
import { startBoardSession } from '@/lib/lichess/sessionService'
import { getSession } from '@/lib/lichess/sessionManager'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  
  if (!lichessUserId) {
    const allCookies = request.cookies.getAll().map(c => c.name)
    console.warn(`[Lichess Session] Attempted to start session without user_id cookie. Present cookies: ${allCookies.join(', ')}`)
    return NextResponse.json({ error: 'Missing Lichess user session. Please click "Reconnect Lichess" to log in again.' }, { status: 401 })
  }

  try {
    await requireLichessLiveAccess(request)
    await startBoardSession(lichessUserId)
    const session = await getSession(lichessUserId)
    return NextResponse.json(session)
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Lichess Session] Failed to start board session:', error)
    return NextResponse.json({ error: error.message || 'Failed to start session' }, { status: 500 })
  }
}
