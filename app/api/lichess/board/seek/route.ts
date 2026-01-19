import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { getLichessToken } from '@/lib/lichess/tokenStorage'

export const runtime = 'nodejs'

interface SeekRequest {
  time?: number // Initial time in seconds
  increment?: number // Time increment in seconds
  rated?: boolean
  variant?: string // 'standard', 'chess960', etc.
  color?: 'white' | 'black' | 'random'
}

export async function POST(request: NextRequest) {
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored) {
    return NextResponse.json({ error: 'Missing token' }, { status: 401 })
  }

  try {
    const body: SeekRequest = await request.json().catch(() => ({}))
    
    // Default to a quick game: 3+2 (3 minutes + 2 second increment)
    // Lichess API expects time in minutes for this endpoint
    const time = body.time ?? 3
    const increment = body.increment ?? 2
    const rated = body.rated ?? false
    const variant = body.variant ?? 'standard'
    const color = body.color ?? 'random'

    // Lichess seek endpoint expects form data
    const formData = new URLSearchParams()
    formData.append('time', time.toString())
    formData.append('increment', increment.toString())
    formData.append('rated', rated.toString())
    formData.append('variant', variant)
    formData.append('color', color)

    console.log(`[Lichess Seek] Seeking match: ${time}+${increment}, rated=${rated}, variant=${variant}, color=${color}`)

    const response = await lichessFetch('/api/board/seek', {
      method: 'POST',
      token: stored.token.accessToken,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString()
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(`[Lichess Seek] Failed: ${response.status} - ${errorText}`)
      return NextResponse.json({ error: errorText || 'Failed to seek match' }, { status: response.status })
    }

    const result = await response.text()
    console.log(`[Lichess Seek] Success: ${result}`)
    
    return NextResponse.json({ success: true, message: 'Seeking match...' })
  } catch (error: any) {
    console.error('[Lichess Seek] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to seek match' }, { status: 500 })
  }
}
