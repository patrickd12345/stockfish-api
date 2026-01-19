import { NextRequest, NextResponse } from 'next/server'
import { startBoardSession } from '@/lib/lichess/sessionService'
import { getSession } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  await startBoardSession(lichessUserId)
  const session = await getSession(lichessUserId)
  return NextResponse.json(session)
}
