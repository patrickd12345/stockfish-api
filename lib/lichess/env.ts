export const LICHESS_BASE_URL = process.env.LICHESS_BASE_URL?.trim() || 'https://lichess.org'

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getOAuthConfig() {
  const clientId = process.env.LICHESS_CLIENT_ID?.trim() || 'stockfish-api-coach'
  // Lichess OAuth2 with PKCE doesn't strictly require a client secret for public clients
  // Support both LICHESS_CLIENT_SECRET and MYCHESSCOACH_SECRET as fallbacks
  const clientSecret = process.env.LICHESS_CLIENT_SECRET?.trim() || process.env.MYCHESSCOACH_SECRET?.trim() || ''
  const redirectUri = process.env.LICHESS_REDIRECT_URI?.trim()
  return { clientId, clientSecret, redirectUri }
}
