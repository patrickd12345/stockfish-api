import { NextRequest, NextResponse } from 'next/server'
import { getLichessToken, revokeLichessToken } from '@/lib/lichess/tokenStorage'
import { revokeToken } from '@/lib/lichess/oauth'
import { clearActiveGame } from '@/lib/lichess/sessionManager'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Missing Lichess user session' }, { status: 401 })
  }

  // Prevent returning into a stuck/stale active game after re-auth.
  await clearActiveGame(lichessUserId).catch(() => null)

  const stored = await getLichessToken(lichessUserId)
  let remoteRevoked = false
  if (stored) {
    // Remote revoke can fail depending on token type / endpoint support.
    // Disconnect must still succeed locally (cookie + DB) even if remote revoke fails.
    try {
      await revokeToken(stored.token.accessToken)
      remoteRevoked = true
    } catch (err) {
      console.warn('[Lichess OAuth] Remote token revoke failed (continuing):', err)
    }
    await revokeLichessToken(lichessUserId)
  }

  const response = NextResponse.json({ status: 'revoked', remoteRevoked })
  response.cookies.delete('lichess_user_id')
  return response
}
