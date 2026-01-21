import { NextRequest, NextResponse } from 'next/server'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { LichessApiError } from '@/lib/lichess/apiClient'

export const runtime = 'nodejs'

export async function POST(request: NextRequest, context: { params: { id: string } }) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const id = context?.params?.id
  if (!id) {
    return NextResponse.json({ error: 'Missing challenge id' }, { status: 400 })
  }

  try {
    await lichessFetch(`/api/challenge/${encodeURIComponent(id)}/cancel`, {
      method: 'POST',
      token: stored.token.accessToken,
      signal: request.signal,
    })
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    if (err instanceof LichessApiError) {
      return NextResponse.json({ error: err.payload || 'Lichess API error' }, { status: err.status })
    }
    return NextResponse.json({ error: err?.message || 'Failed to cancel challenge' }, { status: 500 })
  }
}

