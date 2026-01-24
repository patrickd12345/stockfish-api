import { NextRequest, NextResponse } from 'next/server'
import { buildOAuthUrl, createCodeChallenge, createCodeVerifier, createOAuthState } from '@/lib/lichess/oauth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(request: NextRequest) {
  try {
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
      // board:play is required for the board API (moves, seek, etc).
      // challenge:write is required for creating/canceling lobby challenges (open challenge fallback).
      scopes: ['board:play', 'challenge:write']
  })

  const response = NextResponse.redirect(url)
    const isProduction = process.env.NODE_ENV === 'production'
    const isSecure = isProduction && origin.startsWith('https://')
    
    const cookieOptions = { 
      httpOnly: true, 
      secure: isSecure, 
      sameSite: 'lax' as const, 
      path: '/',
      maxAge: 60 * 10 // 10 minutes for handshake
    }

    console.log(`[Lichess OAuth] Starting flow. Handshake cookies secure: ${isSecure}`)

    response.cookies.set('lichess_oauth_state', state, cookieOptions)
    response.cookies.set('lichess_oauth_verifier', verifier, cookieOptions)
  if (redirectTarget) {
      response.cookies.set('lichess_oauth_redirect', redirectTarget, cookieOptions)
  }
  return response
  } catch (error: any) {
    console.error('Lichess OAuth start failed:', error)
    const origin = request.nextUrl.origin
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }
}
