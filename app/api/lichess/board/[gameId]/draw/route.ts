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
    const { accept } = await request.json().catch(() => ({ accept: true }))
    const action = accept ? 'yes' : 'no'
    
    const response = await lichessFetch(`/api/board/game/${params.gameId}/draw/${action}`, {
      method: 'POST',
      token: stored.token.accessToken,
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText || 'Failed to draw' }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Lichess Draw] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to draw' }, { status: 500 })
  }
}
