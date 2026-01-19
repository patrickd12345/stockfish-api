import crypto from 'crypto'
import { LICHESS_BASE_URL, getOAuthConfig } from '@/lib/lichess/env'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { LichessOAuthToken } from '@/lib/lichess/types'

export function createOAuthState(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function createCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

export function createCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

export function buildOAuthUrl(params: {
  redirectUri: string
  state: string
  codeChallenge: string
  scopes: string[]
}): string {
  const { clientId } = getOAuthConfig()
  const search = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: params.redirectUri,
    scope: params.scopes.join(' '),
    state: params.state,
    code_challenge: params.codeChallenge,
    code_challenge_method: 'S256'
  })

  return `${LICHESS_BASE_URL}/oauth?${search.toString()}`
}

export async function exchangeCodeForToken(params: {
  code: string
  redirectUri: string
  codeVerifier: string
}): Promise<LichessOAuthToken> {
  const { clientId, clientSecret } = getOAuthConfig()
  const params_body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    code_verifier: params.codeVerifier
  }

  if (clientSecret) {
    params_body.client_secret = clientSecret
  }

  const body = new URLSearchParams(params_body)

  const response = await lichessFetch('/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  const payload = await response.json()

  if (!response.ok) {
    throw new Error(`Lichess token exchange failed: ${payload.error_description || payload.error || response.statusText}`)
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    scope: (payload.scope || '').split(' ').filter(Boolean),
    expiresIn: payload.expires_in,
    createdAt: new Date()
  }
}

export async function revokeToken(accessToken: string): Promise<void> {
  await lichessFetch('/api/token/revoke', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ token: accessToken }).toString()
  })
}
