import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { getLichessToken } from '@/lib/lichess/tokenStorage'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string; uci: string } }
) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  const { gameId, uci } = params

  try {
    const response = await lichessFetch(`/api/board/game/${gameId}/move/${uci}`, {
      method: 'POST',
      token: stored.token.accessToken
    })

    if (!response.ok) {
      const errorText = await response.text()
      try {
        const json = JSON.parse(errorText)
        return NextResponse.json({ error: json.error || errorText }, { status: response.status })
      } catch {
        return NextResponse.json({ error: errorText }, { status: response.status })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Move relay failed:', error)
    if (error.status && error.payload) {
      try {
        const json = JSON.parse(error.payload)
        return NextResponse.json({ error: json.error || json.message || error.message }, { status: error.status })
      } catch {
        return NextResponse.json({ error: error.payload || error.message }, { status: error.status })
      }
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
