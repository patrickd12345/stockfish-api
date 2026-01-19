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
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: params.codeVerifier
  })

  const response = await lichessFetch('/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  })

  const payload = (await response.json()) as {
    access_token: string
    token_type: string
    scope: string
    expires_in?: number
  }

  return {
    accessToken: payload.access_token,
    tokenType: payload.token_type,
    scope: payload.scope.split(' '),
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
