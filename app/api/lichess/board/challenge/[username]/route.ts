import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { startBoardSession } from '@/lib/lichess/sessionService'

export const runtime = 'nodejs'

export async function POST(
  request: NextRequest,
  { params }: { params: { username: string } }
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
    // Ensure the background event stream is running so "gameStart" gets detected
    await startBoardSession(lichessUserId).catch((err) => {
      console.warn('[Lichess Challenge] Failed to auto-start board session (continuing):', err)
    })

    const body = await request.json().catch(() => ({}))
    const limit = (body.time || 3) * 60
    const increment = body.increment || 2
    const rated = typeof body.rated === 'boolean' ? body.rated : false
    
    const formData = new URLSearchParams()
    formData.append('clockLimit', limit.toString())
    formData.append('clockIncrement', increment.toString())
    formData.append('rated', rated ? 'true' : 'false')
    formData.append('color', 'random')
    formData.append('variant', 'standard')

    console.log(`[Lichess Challenge] Challenging ${params.username}: ${limit}s+${increment}s, rated=${rated}`)

    const response = await lichessFetch(`/api/board/challenge/${params.username}`, {
      method: 'POST',
      token: stored.token.accessToken,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      return NextResponse.json({ error: errorText || 'Failed to challenge' }, { status: response.status })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[Lichess Challenge] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to challenge' }, { status: 500 })
  }
}
