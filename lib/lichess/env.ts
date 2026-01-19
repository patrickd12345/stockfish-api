export const LICHESS_BASE_URL = process.env.LICHESS_BASE_URL?.trim() || 'https://lichess.org'

export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

export function getOAuthConfig() {
  const clientId = requireEnv('LICHESS_CLIENT_ID')
  const clientSecret = requireEnv('LICHESS_CLIENT_SECRET')
  const redirectUri = process.env.LICHESS_REDIRECT_URI?.trim()
  return { clientId, clientSecret, redirectUri }
}
