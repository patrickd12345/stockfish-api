import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { fetchAccount } from '@/lib/lichess/account'
import { getLichessToken } from '@/lib/lichess/tokenStorage'

export const runtime = 'nodejs'

interface SeekRequest {
  time?: number // Initial time in seconds
  increment?: number // Time increment in seconds
  rated?: boolean
  variant?: string // 'standard', 'chess960', etc.
  color?: 'white' | 'black' | 'random'
  any?: boolean // if true, use a "fast match" default time control
  ratingDiffLower?: number | null // lower rating diff (below my rating). null = infinity.
  ratingDiffUpper?: number | null // upper rating diff (above my rating). null = infinity.
}

function resolvePerfKey(timeMinutes: number, incrementSeconds: number): 'bullet' | 'blitz' | 'rapid' | 'classical' {
  // Approximate lichess perf selection by initial time in minutes (same thresholds used in UI).
  // Increment is included to avoid weird edge cases like 1+60, but minutes is primary.
  const mins = timeMinutes + incrementSeconds / 60
  if (mins < 3) return 'bullet'
  if (mins < 8) return 'blitz'
  if (mins < 25) return 'rapid'
  return 'classical'
}

function clampInt(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.trunc(n)))
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
    
    // Lichess API expects time in minutes for this endpoint.
    // If "any" is chosen, prefer a very common time control to maximize match speed.
    const fallbackTime = 3
    const fallbackIncrement = 0
    const time = body.any ? fallbackTime : (body.time ?? fallbackTime)
    const increment = body.any ? fallbackIncrement : (body.increment ?? fallbackIncrement)
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

    // Rating range (optional). The endpoint takes absolute min-max ratings, so we convert from
    // user-friendly diffs around the account rating.
    const wantsRatingFilter = body.ratingDiffLower !== undefined || body.ratingDiffUpper !== undefined
    if (wantsRatingFilter) {
      try {
        const account = await fetchAccount(stored.token.accessToken)
        const perfs = (account?.perfs ?? {}) as Record<string, any>
        const perfKey = resolvePerfKey(time, increment)
        const myRatingRaw = perfs?.[perfKey]?.rating
        const myRating = typeof myRatingRaw === 'number' ? myRatingRaw : null

        if (myRating !== null) {
          const lowerDiff =
            typeof body.ratingDiffLower === 'number' && Number.isFinite(body.ratingDiffLower)
              ? Math.max(0, body.ratingDiffLower)
              : null
          const upperDiff =
            typeof body.ratingDiffUpper === 'number' && Number.isFinite(body.ratingDiffUpper)
              ? Math.max(0, body.ratingDiffUpper)
              : null

          const minRating =
            lowerDiff === null ? 0 : clampInt(myRating - lowerDiff, 0, 10000)
          const maxRating =
            upperDiff === null ? 10000 : clampInt(myRating + upperDiff, 0, 10000)

          formData.append('ratingRange', `${minRating}-${maxRating}`)
        }
      } catch (e) {
        // Non-fatal: seek without rating filter if we can't resolve account rating.
        console.warn('[Lichess Seek] Failed to resolve rating range, continuing without it.', e)
      }
    }

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
