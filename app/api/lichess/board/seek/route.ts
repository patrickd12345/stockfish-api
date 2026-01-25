import { NextRequest, NextResponse } from 'next/server'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { fetchAccount } from '@/lib/lichess/account'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import { LichessApiError } from '@/lib/lichess/apiClient'
import { startBoardSession } from '@/lib/lichess/sessionService'
import { getStreamHandler } from '@/lib/lichess/streamRegistry'
import { requireLichessLiveAccess, LichessAccessError } from '@/lib/lichess/featureAccess'
import { getAuthContext } from '@/lib/auth'

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
  // Check app authentication first
  const authContext = getAuthContext(request)
  if (!authContext) {
    console.error('[Lichess Seek] No auth context')
    return NextResponse.json({ error: 'Unauthorized - please sign in' }, { status: 401 })
  }

  // Lichess features require Lichess OAuth connection
  const lichessUserId = request.cookies.get('lichess_user_id')?.value
  if (!lichessUserId) {
    console.error('[Lichess Seek] No lichess_user_id cookie')
    return NextResponse.json({ 
      error: 'Lichess account not connected. Please connect your Lichess account to use matching features.',
      requiresLichessConnection: true
    }, { status: 403 })
  }

  const stored = await getLichessToken(lichessUserId)
  if (!stored) {
    console.error('[Lichess Seek] No stored token for lichessUserId:', lichessUserId)
    return NextResponse.json({ 
      error: 'Lichess token missing. Please reconnect your Lichess account.',
      requiresLichessConnection: true
    }, { status: 403 })
  }

  try {
    await requireLichessLiveAccess(request)
    // Ensure the background event stream is running so "gameStart" gets detected
    // Check if handler exists first to avoid starting a new connection attempt
    // that would conflict with the seek request (Lichess doesn't allow concurrent requests)
    const existingHandler = getStreamHandler(lichessUserId)
    if (!existingHandler) {
      // Start session but don't wait - Lichess doesn't allow concurrent requests
      await startBoardSession(lichessUserId, false).catch((err) => {
        console.warn('[Lichess Seek] Failed to auto-start board session (continuing):', err)
      })
      // Longer delay to ensure any initial connection attempt has completed or failed
      // This avoids the "Please only run 1 request(s) at a time" error
      await new Promise(resolve => setTimeout(resolve, 2000))
    } else if (!existingHandler.isStreamConnected()) {
      // Handler exists but not connected - wait a bit for it to connect or fail
      // This avoids conflicts if the handler is currently retrying
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    const body: SeekRequest = await request.json().catch(() => ({}))
    
    // Lichess API expects time in minutes for this endpoint.
    // If "any" is chosen, prefer a very common time control to maximize match speed.
    const fallbackTime = 10
    const fallbackIncrement = 5
    let time = body.any ? fallbackTime : (body.time ?? fallbackTime)
    let increment = body.any ? fallbackIncrement : (body.increment ?? fallbackIncrement)
    
    // Lichess /api/board/seek ONLY supports Rapid and Classical time controls.
    // Blitz and Bullet are NOT supported. We normalize Blitz/Bullet to Rapid equivalents.
    const VALID_PRESETS = [
      { time: 10, increment: 0 },  // Rapid
      { time: 10, increment: 5 },   // Rapid
      { time: 15, increment: 10 },  // Rapid
      { time: 30, increment: 0 },    // Classical
      { time: 30, increment: 20 },  // Classical
    ]
    
    // Normalize to nearest valid preset if the exact combination isn't in our list
    // This converts Blitz/Bullet to Rapid equivalents
    const normalizeToPreset = (t: number, inc: number): { time: number; increment: number } => {
      // Check if exact match exists
      const exactMatch = VALID_PRESETS.find(p => p.time === t && p.increment === inc)
      if (exactMatch) return exactMatch
      
      // Find closest preset by total time
      const totalMinutes = t + inc / 60
      let closest = VALID_PRESETS[0]
      let minDiff = Math.abs(totalMinutes - (closest.time + closest.increment / 60))
      
      for (const preset of VALID_PRESETS) {
        const diff = Math.abs(totalMinutes - (preset.time + preset.increment / 60))
        if (diff < minDiff) {
          minDiff = diff
          closest = preset
        }
      }
      return closest
    }
    
    // Normalize the time control to a valid Rapid/Classical preset
    // This converts Blitz (3+0, 5+0) and Bullet (1+0, 2+1) to Rapid (10+0, 10+5)
    const normalized = normalizeToPreset(time, increment)
    const originalTime = time
    const originalIncrement = increment
    time = normalized.time
    increment = normalized.increment
    
    // Log if we converted Blitz/Bullet to Rapid
    const perfKey = resolvePerfKey(originalTime, originalIncrement)
    if (perfKey === 'bullet' || perfKey === 'blitz') {
      console.log(`[Lichess Seek] Converted ${perfKey} ${originalTime}+${originalIncrement} to Rapid ${time}+${increment} (Lichess board API only supports Rapid/Classical)`)
    }
    
    // Lichess /api/board/seek expects time in MINUTES (not seconds).
    // The API documentation indicates time should be in minutes.
    const timeMinutes = Math.max(1, Math.min(180, Math.trunc(time)))
    const incrementSeconds = Math.max(0, Math.min(60, Math.trunc(increment)))
    
    const rated = body.rated ?? false
    const variant = body.variant ?? 'standard'
    const color = body.color ?? 'random'

    // Lichess seek endpoint expects form data
    const formData = new URLSearchParams()
    formData.append('time', timeMinutes.toString())
    formData.append('increment', incrementSeconds.toString())
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

    console.log(`[Lichess Seek] Seeking match: ${timeMinutes}min+${incrementSeconds}sec, rated=${rated}, variant=${variant}, color=${color}`)
    console.log(`[Lichess Seek] Payload: ${formData.toString()}`)
    
    // #region agent log
    fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/lichess/board/seek/route.ts:212',message:'Seek request received',data:{originalTime,originalIncrement,timeMinutes,incrementSecondsInput:increment,incrementSeconds,rated,variant,color,normalized:originalTime!==time||originalIncrement!==increment},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
    // #endregion

    const doSeek = async (payload: URLSearchParams, retryCount: number = 0): Promise<string> => {
      console.log(`[Lichess Seek] Calling /api/board/seek with payload: ${payload.toString()}`)
      // #region agent log
      fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/lichess/board/seek/route.ts:219',message:'About to call Lichess API',data:{payload:payload.toString(),timeValue:payload.get('time'),incrementValue:payload.get('increment'),retryCount},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
      // #endregion
      const response = await lichessFetch('/api/board/seek', {
        method: 'POST',
        token: stored.token.accessToken,
        signal: request.signal,
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: payload.toString()
      })
      const status = response.status
      // Lichess /api/board/seek returns empty body on success, so skip reading if 200
      let result = ''
      if (status === 200) {
        // Empty response is expected for successful seeks
        result = ''
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/lichess/board/seek/route.ts:227',message:'Seek API call succeeded',data:{status,timeMinutes,incrementSeconds,rated},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
        // #endregion
      } else {
        result = await Promise.race([
          response.text().catch(() => ''),
          new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000))
        ])
        // #region agent log
        fetch('http://127.0.0.1:7244/ingest/88284da5-0467-44ea-a88f-d6e865b71aa7',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'app/api/lichess/board/seek/route.ts:235',message:'Seek API call failed',data:{status,result:result.substring(0,200),timeMinutes,incrementSeconds,rated},timestamp:Date.now(),sessionId:'debug-session',runId:'debug-test'})}).catch(()=>{});
        // #endregion
      }
      console.log(`[Lichess Seek] Response status: ${status}, body length: ${result.length}, body: "${result.substring(0, 100)}"`)
      if (!response.ok) {
        // Handle 429 "concurrent request" error with retry
        // Check for various forms of the concurrent request error message
        const isConcurrentRequestError = status === 429 && 
          (result.includes('Please only run 1 request') || 
           result.includes('only run 1 request') ||
           result.includes('concurrent request'))
        
        if (isConcurrentRequestError && retryCount < 3) {
          const delay = (retryCount + 1) * 1000 // 1s, 2s, 3s delays
          console.log(`[Lichess Seek] Concurrent request detected, retrying after ${delay}ms (attempt ${retryCount + 1}/3)`)
          await new Promise(resolve => setTimeout(resolve, delay))
          return doSeek(payload, retryCount + 1)
        }
        throw new LichessApiError(`Seek failed: ${status}`, status, result)
      }
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
      console.log(`[Lichess Seek] Seek submitted successfully, waiting for match...`)
      
      // Wait for gameStart event (synchronous matching)
      // Get the stream handler to wait for game start
      const handler = getStreamHandler(lichessUserId)
      if (!handler) {
        console.warn('[Lichess Seek] No stream handler available, returning immediately')
        return NextResponse.json({ success: true, message: 'Seeking match...' })
      }
      
      try {
        // Wait up to 60 seconds for a match
        const gameId = await handler.waitForGameStart(60000)
        console.log(`[Lichess Seek] Match found! Game ID: ${gameId}`)
        return NextResponse.json({ 
          success: true, 
          gameId,
          message: 'Match found!' 
        })
      } catch (waitError: any) {
        // Timeout or error waiting for match
        if (waitError.message?.includes('Timeout')) {
          console.log(`[Lichess Seek] Timeout waiting for match, but seek is still active`)
          return NextResponse.json({ 
            success: true, 
            stillSeeking: true,
            message: 'Seeking match... (still waiting)' 
          })
        }
        // Other error - return success anyway since seek was submitted
        console.warn(`[Lichess Seek] Error waiting for match:`, waitError)
        return NextResponse.json({ 
          success: true, 
          stillSeeking: true,
          message: 'Seeking match...' 
        })
      }
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
            console.log(`[Lichess Seek] Success (ratingRange skipped), waiting for match...`)
            
            // Wait for gameStart event
            const handler = getStreamHandler(lichessUserId)
            if (handler) {
              try {
                const gameId = await handler.waitForGameStart(60000)
                return NextResponse.json({
                  success: true,
                  gameId,
                  message: 'Match found!'
                })
              } catch (waitError: any) {
                if (waitError.message?.includes('Timeout')) {
                  return NextResponse.json({
                    success: true,
                    stillSeeking: true,
                    message: 'Seeking match... (still waiting)'
                  })
                }
              }
            }
            
            return NextResponse.json({
              success: true,
              stillSeeking: true,
              message: 'Seeking match... (rating filter not supported for this account/time control)',
            })
          } catch (retryErr: any) {
            if (retryErr instanceof LichessApiError) {
              const retryMsg = extractLichessErrorMessage(retryErr.payload)
              console.warn(`[Lichess Seek] Retry failed: ${retryErr.status} - ${retryMsg}`)

              if (retryErr.status === 400 && isInvalidTimeControl(retryMsg)) {
                // Time is already in seconds, so try open challenge fallback
                console.warn(`[Lichess Seek] Time control still invalid after retry, trying open challenge fallback`)
                try {
                  const opened = await doOpenChallenge(time, increment)
                  if (opened?.challengeId) {
                    // For open challenges, we can't wait for gameStart the same way
                    // Return immediately with challenge ID
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
                return NextResponse.json({ error: retryMsg }, { status: retryErr.status })
              }

              return NextResponse.json({ error: retryMsg }, { status: retryErr.status })
            }
            throw retryErr
          }
        }

        console.warn(`[Lichess Seek] Lichess rejected seek: ${err.status} - ${msg}`)
        // Provide user-friendly error messages
        let userMessage = msg
        if (err.status === 400 && isInvalidTimeControl(msg)) {
          userMessage = `Invalid time control (${time}min+${increment}sec). Lichess board API only supports Rapid (10+0, 10+5) and Classical (30+0, 30+20) time controls.`
        } else if (err.status === 429) {
          userMessage = 'Rate limit exceeded. Please wait a moment before seeking again.'
        } else if (err.status === 403) {
          userMessage = 'Access denied. Please check your Lichess account connection.'
        }
        return NextResponse.json({ error: userMessage }, { status: err.status })
      }
      throw err
    }
  } catch (error: any) {
    if (error instanceof LichessAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('[Lichess Seek] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to seek match' }, { status: 500 })
  }
}
