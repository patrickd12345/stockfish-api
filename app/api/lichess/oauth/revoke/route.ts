import { NextRequest, NextResponse } from 'next/server'
import { getLichessToken, revokeLichessToken } from '@/lib/lichess/tokenStorage'
import { revokeToken } from '@/lib/lichess/oauth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (stored) {
    await revokeToken(stored.token.accessToken)
    await revokeLichessToken(lichessUserId)
  }

  const response = NextResponse.json({ status: 'revoked' })
  response.cookies.delete('lichess_user_id')
  return response
}
