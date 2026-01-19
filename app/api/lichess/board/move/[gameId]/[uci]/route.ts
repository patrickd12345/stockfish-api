import { NextRequest, NextResponse } from 'next/server'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { submitMove } from '@/lib/lichess/moveRelay'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, { params }: { params: { gameId: string; uci: string } }) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored || stored.revokedAt) {
    return NextResponse.json({ error: 'Missing or revoked token' }, { status: 401 })
  }

  try {
    await submitMove(stored.token.accessToken, params.gameId, params.uci)
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Move rejected'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
