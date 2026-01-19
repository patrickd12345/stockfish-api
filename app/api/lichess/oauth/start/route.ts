import { NextRequest, NextResponse } from 'next/server'
import { buildOAuthUrl, createCodeChallenge, createCodeVerifier, createOAuthState } from '@/lib/lichess/oauth'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const state = createOAuthState()
  const verifier = createCodeVerifier()
  const codeChallenge = createCodeChallenge(verifier)
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/lichess/oauth/callback`
  const redirectTarget = request.nextUrl.searchParams.get('redirect')

  const url = buildOAuthUrl({
    redirectUri,
    state,
    codeChallenge,
    scopes: ['board:play', 'board:read']
  })

  const response = NextResponse.redirect(url)
  response.cookies.set('lichess_oauth_state', state, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  response.cookies.set('lichess_oauth_verifier', verifier, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  if (redirectTarget) {
    response.cookies.set('lichess_oauth_redirect', redirectTarget, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' })
  }
  return response
}
