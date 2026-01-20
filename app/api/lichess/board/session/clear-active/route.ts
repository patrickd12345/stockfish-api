import { NextRequest, NextResponse } from 'next/server'
import { clearActiveGame } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  const result = await clearActiveGame(lichessUserId)
  return NextResponse.json({ status: 'cleared', ...result })
}

