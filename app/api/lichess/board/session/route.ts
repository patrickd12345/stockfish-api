import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json(null, { status: 200 })
  }

  const session = await getSession(lichessUserId)
  // If the user is authenticated (cookie present) but hasn't started a live session yet,
  // return an explicit "idle" session object so the UI can distinguish from "not connected".
  if (!session) {
    return NextResponse.json({ status: 'idle' }, { status: 200 })
  }
  return NextResponse.json(session)
}
