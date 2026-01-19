import { NextRequest, NextResponse } from 'next/server'
import { exchangeCodeForToken } from '@/lib/lichess/oauth'
import { fetchAccount } from '@/lib/lichess/account'
import { storeLichessToken } from '@/lib/lichess/tokenStorage'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const state = request.nextUrl.searchParams.get('state')
  const storedState = request.cookies.get('lichess_oauth_state')?.value
  const verifier = request.cookies.get('lichess_oauth_verifier')?.value
  const origin = request.nextUrl.origin
  const redirectUri = `${origin}/api/lichess/oauth/callback`

  if (!code || !state || !storedState || state !== storedState || !verifier) {
    return NextResponse.json({ error: 'Invalid OAuth state' }, { status: 400 })
  }

  try {
    const token = await exchangeCodeForToken({ code, redirectUri, codeVerifier: verifier })
    const account = await fetchAccount(token.accessToken)
    await storeLichessToken(account.id, token)

    const response = NextResponse.redirect(request.cookies.get('lichess_oauth_redirect')?.value || '/')
    const isSecure = origin.startsWith('https://')
    
    console.log(`[Lichess OAuth] Callback success for user ${account.id}. Setting session cookie. Secure: ${isSecure}`)

    response.cookies.set('lichess_user_id', account.id, { 
      httpOnly: true, 
      secure: isSecure, 
      sameSite: 'lax', 
      path: '/' 
    })
    response.cookies.delete('lichess_oauth_state')
    response.cookies.delete('lichess_oauth_verifier')
    response.cookies.delete('lichess_oauth_redirect')
    return response
  } catch (error: any) {
    console.error('Lichess OAuth callback failed:', error)
    return NextResponse.redirect(`${origin}/?error=${encodeURIComponent(error.message)}`)
  }
}
