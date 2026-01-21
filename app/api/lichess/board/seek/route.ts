import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { fetchAccount } from '@/lib/lichess/account'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { LichessApiError } from '@/lib/lichess/apiClient'
import { startBoardSession } from '@/lib/lichess/sessionService'

export const runtime = 'nodejs'

interface SeekRequest {
  time?: number // Initial time in minutes
  increment?: number // Time increment in seconds
  rated?: boolean
  variant?: string // 'standard', 'chess960', etc.
  color?: 'white' | 'black' | 'random'
  any?: boolean // if true, use a "fast match" default time control
  ratingDiffLower?: number | null // lower rating diff (below my rating). null = infinity.
  ratingDiffUpper?: number | null // upper rating diff (above my rating). null = infinity.
}

function extractLichessErrorMessage(payload?: string): string {
  if (!payload) return 'Lichess API error'
  try {
    const parsed = JSON.parse(payload) as any
    const global = parsed?.global
    if (Array.isArray(global) && global.length > 0) return String(global[0])
    const errorGlobal = parsed?.error?.global
    if (Array.isArray(errorGlobal) && errorGlobal.length > 0) return String(errorGlobal[0])
  } catch {
    // ignore
  }
  return payload
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

function stripRatingRange(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params)
  next.delete('ratingRange')
  return next
}

function payloadHasRatingRangeError(payload?: string): boolean {
  if (!payload) return false
  try {
    const parsed = JSON.parse(payload) as any
    if (parsed?.ratingRange) return true
    if (parsed?.error?.ratingRange) return true
    if (parsed?.errors?.ratingRange) return true
  } catch {
    // ignore
  }
  return false
}

function isInvalidTimeControl(message: string): boolean {
  return message.toLowerCase().includes('invalid time control')
}

function isMissingChallengeWriteScope(payload?: string): boolean {
  if (!payload) return false
  return payload.includes('Missing scope') && payload.includes('challenge:write')
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
    // Ensure the background event stream is running so "gameStart" gets detected
    // and the UI can immediately transition into the game when a match is found.
    await startBoardSession(lichessUserId).catch((err) => {
      console.warn('[Lichess Seek] Failed to auto-start board session (continuing):', err)
    })

    const body: SeekRequest = await request.json().catch(() => ({}))
    
    // Lichess API expects time in minutes for this endpoint.
    // If "any" is chosen, prefer a very common time control to maximize match speed.
    const fallbackTime = 5
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
    // Only send optional params when non-default to avoid server-side validation quirks.
    if (variant && variant !== 'standard') formData.append('variant', variant)
    if (color && color !== 'random') formData.append('color', color)

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

          // Lichess ratingRange is typically "min-max" (dash-separated).
          // Some accounts/time controls may still reject it; we retry without it below.
          formData.append('ratingRange', `${minRating}-${maxRating}`)
        }
      } catch (e) {
        // Non-fatal: seek without rating filter if we can't resolve account rating.
        console.warn('[Lichess Seek] Failed to resolve rating range, continuing without it.', e)
      }
    }

    console.log(`[Lichess Seek] Seeking match: ${time}+${increment}, rated=${rated}, variant=${variant}, color=${color}`)
    console.log(`[Lichess Seek] Payload: ${formData.toString()}`)

    const doSeek = async (payload: URLSearchParams) => {
      const response = await lichessFetch('/api/board/seek', {
        method: 'POST',
        token: stored.token.accessToken,
        signal: request.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString()
      })
      const result = await response.text().catch(() => '')
      return result
    }

    const doOpenChallenge = async (clockMinutes: number, clockIncrementSeconds: number) => {
      // Open challenge is a reliable fallback when /api/board/seek rejects parameters.
      // It creates a lobby challenge that anyone can accept.
      const clockLimitSeconds = Math.max(60, Math.min(10800, Math.trunc(clockMinutes) * 60))
      const incSeconds = Math.max(0, Math.min(180, Math.trunc(clockIncrementSeconds)))

      const openPayload = new URLSearchParams()
      openPayload.append('rated', rated.toString())
      openPayload.append('clock.limit', String(clockLimitSeconds))
      openPayload.append('clock.increment', String(incSeconds))
      if (variant && variant !== 'standard') openPayload.append('variant', variant)
      if (color && color !== 'random') openPayload.append('color', color)

      console.warn(`[Lichess Seek] Falling back to /api/challenge/open: ${openPayload.toString()}`)

      const response = await lichessFetch('/api/challenge/open', {
        method: 'POST',
        token: stored.token.accessToken,
        signal: request.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: openPayload.toString(),
      })

      // Lichess returns JSON for /api/challenge/open
      const json = (await response.json().catch(() => null)) as any
      const challengeId = typeof json?.challenge?.id === 'string' ? json.challenge.id : null
      return { challengeId, raw: json }
    }

    try {
      const result = await doSeek(formData)
      console.log(`[Lichess Seek] Success: ${result}`)

      return NextResponse.json({ success: true, message: 'Seeking match...' })
    } catch (err: any) {
      if (err instanceof LichessApiError) {
        const msg = extractLichessErrorMessage(err.payload)
        // Lichess can reject ratingRange with either a structured ratingRange error OR a generic
        // "Invalid time control" message. If ratingRange was included, retry without it.
        const hadRatingRange = formData.has('ratingRange')
        if (err.status === 400 && hadRatingRange && (wantsRatingFilter || payloadHasRatingRangeError(err.payload))) {
          const fallbackPayload = stripRatingRange(formData)
          console.warn(
            `[Lichess Seek] ratingRange rejected; retrying without ratingRange. Original: ${formData.toString()}`
          )
          try {
            const result = await doSeek(fallbackPayload)
            console.log(`[Lichess Seek] Success (ratingRange skipped): ${result}`)
            return NextResponse.json({
              success: true,
              message: 'Seeking match... (rating filter not supported for this account/time control)',
            })
          } catch (retryErr: any) {
            if (retryErr instanceof LichessApiError) {
              const retryMsg = extractLichessErrorMessage(retryErr.payload)
              console.warn(`[Lichess Seek] Retry failed: ${retryErr.status} - ${retryMsg}`)

              if (retryErr.status === 400 && isInvalidTimeControl(retryMsg)) {
                const timeSeconds = Math.max(60, Math.min(10800, time * 60))
                const secondsPayload = new URLSearchParams(fallbackPayload)
                secondsPayload.set('time', String(timeSeconds))
                console.warn(
                  `[Lichess Seek] Retrying with time in seconds: ${secondsPayload.toString()}`
                )
                try {
                  const secondsResult = await doSeek(secondsPayload)
                  console.log(`[Lichess Seek] Success (seconds time): ${secondsResult}`)
                  return NextResponse.json({
                    success: true,
                    message: 'Seeking match... (time control normalized)',
                  })
                } catch (secondsErr: any) {
                  if (secondsErr instanceof LichessApiError) {
                    const secondsMsg = extractLichessErrorMessage(secondsErr.payload)
                    console.warn(`[Lichess Seek] Seconds retry failed: ${secondsErr.status} - ${secondsMsg}`)
                    // Final fallback: open challenge
                    try {
                      const opened = await doOpenChallenge(time, increment)
                      if (opened?.challengeId) {
                        return NextResponse.json({
                          success: true,
                          mode: 'open_challenge',
                          challengeId: opened.challengeId,
                          message: 'Seeking match... (open challenge)',
                        })
                      }
                    } catch (openErr: any) {
                      if (openErr instanceof LichessApiError && openErr.status === 403 && isMissingChallengeWriteScope(openErr.payload)) {
                        return NextResponse.json(
                          {
                            error:
                              'Lichess token is missing scope challenge:write. Disconnect + Reconnect Lichess to enable open-challenge fallback.',
                          },
                          { status: 403 }
                        )
                      }
                      console.warn('[Lichess Seek] Open challenge fallback failed:', openErr)
                    }
                    return NextResponse.json({ error: secondsMsg }, { status: secondsErr.status })
                  }
                  throw secondsErr
                }
              }

              return NextResponse.json({ error: retryMsg }, { status: retryErr.status })
            }
            throw retryErr
          }
        }

        if (err.status === 400 && isInvalidTimeControl(msg)) {
          const timeSeconds = Math.max(60, Math.min(10800, time * 60))
          const secondsPayload = new URLSearchParams(formData)
          secondsPayload.delete('ratingRange')
          secondsPayload.set('time', String(timeSeconds))
          console.warn(`[Lichess Seek] Retrying with time in seconds: ${secondsPayload.toString()}`)
          try {
            const secondsResult = await doSeek(secondsPayload)
            console.log(`[Lichess Seek] Success (seconds time): ${secondsResult}`)
            return NextResponse.json({
              success: true,
              message: 'Seeking match... (time control normalized)',
            })
          } catch (secondsErr: any) {
            if (secondsErr instanceof LichessApiError) {
              const secondsMsg = extractLichessErrorMessage(secondsErr.payload)
              console.warn(`[Lichess Seek] Seconds retry failed: ${secondsErr.status} - ${secondsMsg}`)
              // Final fallback: open challenge
              try {
                const opened = await doOpenChallenge(time, increment)
                if (opened?.challengeId) {
                  return NextResponse.json({
                    success: true,
                    mode: 'open_challenge',
                    challengeId: opened.challengeId,
                    message: 'Seeking match... (open challenge)',
                  })
                }
              } catch (openErr: any) {
                if (openErr instanceof LichessApiError && openErr.status === 403 && isMissingChallengeWriteScope(openErr.payload)) {
                  return NextResponse.json(
                    {
                      error:
                        'Lichess token is missing scope challenge:write. Disconnect + Reconnect Lichess to enable open-challenge fallback.',
                    },
                    { status: 403 }
                  )
                }
                console.warn('[Lichess Seek] Open challenge fallback failed:', openErr)
              }
              return NextResponse.json({ error: secondsMsg }, { status: secondsErr.status })
            }
            throw secondsErr
          }
        }

        console.warn(`[Lichess Seek] Lichess rejected seek: ${err.status} - ${msg}`)
        return NextResponse.json({ error: msg }, { status: err.status })
      }
      throw err
    }
  } catch (error: any) {
    console.error('[Lichess Seek] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to seek match' }, { status: 500 })
  }
}
