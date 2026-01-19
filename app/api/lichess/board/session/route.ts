import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json(null, { status: 200 })
  }

  const session = await getSession(lichessUserId)
  return NextResponse.json(session)
}
