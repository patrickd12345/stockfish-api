import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { gameId: string } }
) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  try {
    await requireLichessLiveAccess(request)
    const { text, room } = await request.json()
    
    const formData = new URLSearchParams()
    formData.append('text', text)
    formData.append('room', room || 'player')

    const response = await lichessFetch(`/api/board/game/${params.gameId}/chat`, {
      method: 'POST',
      token: stored.token.accessToken,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText || 'Failed to send chat' }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Lichess Chat] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to send chat' }, { status: 500 })
  }
}
