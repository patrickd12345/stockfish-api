import { LICHESS_BASE_URL } from '@/lib/lichess/env'

export class LichessApiError extends Error {
  status: number
  payload?: string

  constructor(message: string, status: number, payload?: string) {
    super(message)
    this.status = status
    this.payload = payload
  }
}

export async function lichessFetch(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<Response> {
  const url = `${LICHESS_BASE_URL}${path}`
  const headers = new Headers(options.headers)
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`)
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json')
  }

  const response = await fetch(url, { ...options, headers })
  if (!response.ok) {
    const payload = await response.text().catch(() => '')
    throw new LichessApiError(`Lichess API error: ${response.status}`, response.status, payload)
  }
  return response
}
