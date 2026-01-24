import { NextRequest, NextResponse } from 'next/server'
import { stopBoardSession } from '@/lib/lichess/sessionService'
import { setSessionStatus } from '@/lib/lichess/sessionManager'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  try {
    await requireLichessLiveAccess(request)
    stopBoardSession(lichessUserId)
    await setSessionStatus(lichessUserId, 'idle', null)
    return NextResponse.json({ status: 'stopped' })
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}
