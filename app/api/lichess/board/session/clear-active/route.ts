import { NextRequest, NextResponse } from 'next/server'
import { clearActiveGame } from '@/lib/lichess/sessionManager'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  try {
    await requireLichessLiveAccess(request)
    const result = await clearActiveGame(lichessUserId)
    return NextResponse.json({ status: 'cleared', ...result })
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    throw error
  }
}

