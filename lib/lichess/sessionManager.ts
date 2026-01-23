import { connectToDb, getSql } from '@/lib/database'
import { deriveFenFromMoves } from '@/lib/lichess/fen'
import { lichessFetch } from '@/lib/lichess/apiClient'
import { getLichessToken } from '@/lib/lichess/tokenStorage'
import {
  LichessChatLineEvent,
  LichessGameFinishEvent,
  LichessGameStartEvent,
  LichessGameFullEvent,
  LichessGameStateEvent,
  LichessGameState,
  LichessBoardSession
} from '@/lib/lichess/types'

function normalizeLichessId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.toLowerCase()
}

// Simple in-memory cache for throttling sync calls in the same execution context.
const lastSyncAt: Record<string, number> = {}
const SYNC_THROTTLE_MS = 15000 // 15 seconds

/**
 * Fetches active games from Lichess and updates our database.
 * Useful for "discovering" games that started while our stream handler was offline.
 */
export async function syncActiveGames(lichessUserId: string): Promise<void> {
  const now = Date.now()
  const last = lastSyncAt[lichessUserId] || 0
  if (now - last < SYNC_THROTTLE_MS) return
  lastSyncAt[lichessUserId] = now

  const stored = await getLichessToken(lichessUserId)
  if (!stored || stored.revokedAt) return

  try {
    const response = await lichessFetch('/api/account/playing', { token: stored.token.accessToken })
    const data = await response.json() as { nowPlaying: any[] }
    const nowPlaying = data.nowPlaying || []

    if (nowPlaying.length === 0) {
      // If Lichess says nothing is playing, but our DB says we are, we might want to clean up.
      // However, it's safer to let the stream handler or explicit actions handle that
      // to avoid race conditions with game initialization.
      return
    }

    // For now, we only support one active game.
    const latestGame = nowPlaying[0]
    const gameId = latestGame.gameId

    // Check if we already have this game in our DB
    await connectToDb()
    const sql = getSql()
    const existing = await sql`
      SELECT status FROM lichess_game_states WHERE game_id = ${gameId}
    `

    if (existing.length === 0) {
      console.log(`[Lichess Sync] Discovered new game: ${gameId}`)
      // Trigger a "virtual" gameStart by fetching full game state
      const fullRes = await lichessFetch(`/api/board/game/stream/${gameId}`, { token: stored.token.accessToken })
      const reader = fullRes.body?.getReader()
      if (reader) {
        const decoder = new TextDecoder()
        const { value } = await reader.read()
        const chunk = decoder.decode(value || new Uint8Array())
        const firstLine = chunk.split('\n')[0].trim()
        if (firstLine) {
          try {
            const event = JSON.parse(firstLine) as LichessGameFullEvent
            if (event.type === 'gameFull') {
              await recordGameFull(lichessUserId, event, gameId)
            }
          } catch (e) {
            console.warn('[Lichess Sync] Failed to parse discovered game state:', e)
          }
        }
        reader.releaseLock()
        // We don't keep the stream open here; we just want the initial state.
        // The background handler (re-kicked by the state route) will take over.
      }
    }
  } catch (err) {
    console.warn('[Lichess Sync] Failed to sync active games:', err)
  }
}

function inferMyColorFromGameFull(lichessUserId: string, event: LichessGameFullEvent): 'white' | 'black' | null {
  const me = normalizeLichessId(lichessUserId)
  if (!me) return null

  const whiteId = normalizeLichessId(event.white?.id ?? event.white?.name)
  const blackId = normalizeLichessId(event.black?.id ?? event.black?.name)

  if (whiteId && whiteId === me) return 'white'
  if (blackId && blackId === me) return 'black'
  return null
}

export async function recordGameFull(
  lichessUserId: string,
  event: LichessGameFullEvent,
  gameIdOverride?: string
): Promise<void> {
  await connectToDb()
  const sql = getSql()

  const gameId = gameIdOverride ?? event.id
  if (!gameId) return

  const inferredMyColor = inferMyColorFromGameFull(lichessUserId, event)
  const myColor = inferredMyColor ?? 'white'

  const opponent =
    myColor === 'white'
      ? event.black
      : event.white

  const initialTimeMs = typeof event.clock?.initial === 'number' ? event.clock.initial * 1000 : null
  const initialIncrementMs = typeof event.clock?.increment === 'number' ? event.clock.increment * 1000 : null

  // Ensure session points at this game if we're reconnecting mid-game.
  await sql`
    INSERT INTO lichess_board_sessions (lichess_user_id, status, active_game_id, last_event_at)
    VALUES (${lichessUserId}, 'playing', ${gameId}, now())
    ON CONFLICT (lichess_user_id)
    DO UPDATE SET
      status = 'playing',
      active_game_id = ${gameId},
      last_event_at = now(),
      updated_at = now()
  `

  // Upsert metadata (color/opponent/initial clock). Don't clobber existing initial values once set.
  await sql`
    INSERT INTO lichess_game_states (
      game_id,
      lichess_user_id,
      status,
      moves,
      fen,
      wtime,
      btime,
      winc,
      binc,
      last_move_at,
      last_clock_update_at,
      my_color,
      opponent_name,
      opponent_rating,
      initial_time_ms,
      initial_increment_ms
    ) VALUES (
      ${gameId},
      ${lichessUserId},
      'started',
      ${event.state?.moves ?? ''},
      ${deriveFenFromMoves(event.state?.moves ?? '')},
      ${event.state?.wtime ?? 0},
      ${event.state?.btime ?? 0},
      ${event.state?.winc ?? 0},
      ${event.state?.binc ?? 0},
      null,
      now(),
      ${myColor},
      ${opponent?.name ?? opponent?.id ?? null},
      ${typeof opponent?.rating === 'number' ? opponent.rating : null},
      ${initialTimeMs},
      ${initialIncrementMs}
    )
    ON CONFLICT (game_id)
    DO UPDATE SET
      my_color = COALESCE(lichess_game_states.my_color, EXCLUDED.my_color),
      opponent_name = COALESCE(lichess_game_states.opponent_name, EXCLUDED.opponent_name),
      opponent_rating = COALESCE(lichess_game_states.opponent_rating, EXCLUDED.opponent_rating),
      initial_time_ms = COALESCE(lichess_game_states.initial_time_ms, EXCLUDED.initial_time_ms),
      initial_increment_ms = COALESCE(lichess_game_states.initial_increment_ms, EXCLUDED.initial_increment_ms),
      updated_at = now()
  `
}

export async function ensureBoardSession(lichessUserId: string): Promise<LichessBoardSession> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    INSERT INTO lichess_board_sessions (lichess_user_id, status)
    VALUES (${lichessUserId}, 'connected')
    ON CONFLICT (lichess_user_id)
    DO UPDATE SET status = EXCLUDED.status, updated_at = now()
    RETURNING id, lichess_user_id, status, active_game_id, last_event_at, last_error
  `) as Array<{
    id: string
    lichess_user_id: string
    status: string
    active_game_id: string | null
    last_event_at: Date | null
    last_error: string | null
  }>

  const row = rows[0]
  return {
    id: row.id,
    lichessUserId: row.lichess_user_id,
    status: row.status as LichessBoardSession['status'],
    activeGameId: row.active_game_id,
    lastEventAt: row.last_event_at,
    lastError: row.last_error
  }
}

export async function recordGameStart(lichessUserId: string, event: LichessGameStartEvent): Promise<void> {
  await connectToDb()
  const sql = getSql()
  const gameId = event.game.id
  await sql`
    INSERT INTO lichess_board_sessions (lichess_user_id, status, active_game_id, last_event_at)
    VALUES (${lichessUserId}, 'playing', ${gameId}, now())
    ON CONFLICT (lichess_user_id)
    DO UPDATE SET
      status = 'playing',
      active_game_id = ${gameId},
      last_event_at = now(),
      updated_at = now()
  `

  await sql`
    INSERT INTO lichess_game_states (
      game_id,
      lichess_user_id,
      status,
      moves,
      fen,
      wtime,
      btime,
      winc,
      binc,
      last_move_at,
      last_clock_update_at,
      my_color,
      opponent_name,
      opponent_rating,
      initial_time_ms,
      initial_increment_ms
    ) VALUES (
      ${gameId},
      ${lichessUserId},
      'started',
      '',
      ${deriveFenFromMoves('')},
      ${(event.game.clock?.initial ?? 0) * 1000},
      ${(event.game.clock?.initial ?? 0) * 1000},
      ${(event.game.clock?.increment ?? 0) * 1000},
      ${(event.game.clock?.increment ?? 0) * 1000},
      null,
      now(),
      ${event.game.color ?? 'white'},
      ${event.game.opponent.username ?? null},
      ${event.game.opponent.rating ?? null},
      ${(event.game.clock?.initial ?? 0) * 1000},
      ${(event.game.clock?.increment ?? 0) * 1000}
    )
    ON CONFLICT (game_id)
    DO UPDATE SET
      status = 'started',
      my_color = EXCLUDED.my_color,
      opponent_name = EXCLUDED.opponent_name,
      opponent_rating = EXCLUDED.opponent_rating,
      initial_time_ms = EXCLUDED.initial_time_ms,
      initial_increment_ms = EXCLUDED.initial_increment_ms,
      updated_at = now()
  `
}

export async function recordGameState(
  lichessUserId: string,
  event: LichessGameStateEvent,
  gameIdOverride?: string
): Promise<LichessGameState> {
  await connectToDb()
  const sql = getSql()
  const activeGameId =
    gameIdOverride ??
    (
      ((
        await sql`
          SELECT active_game_id
          FROM lichess_board_sessions
          WHERE lichess_user_id = ${lichessUserId}
        `
      ) as Array<{ active_game_id: string | null }>)[0]?.active_game_id ?? null
    )
  if (!activeGameId) throw new Error('No active game to update')
  const fen = deriveFenFromMoves(event.moves)
  
  // Ensure status is a string
  const statusStr = typeof event.status === 'string' ? event.status : JSON.stringify(event.status)

  const rows = (await sql`
    INSERT INTO lichess_game_states (
      game_id,
      lichess_user_id,
      status,
      moves,
      fen,
      wtime,
      btime,
      winc,
      binc,
      winner,
      last_move_at,
      last_clock_update_at,
      updated_at
    )
    VALUES (
      ${activeGameId},
      ${lichessUserId},
      ${statusStr},
      ${event.moves},
      ${fen},
      ${event.wtime},
      ${event.btime},
      ${event.winc},
      ${event.binc},
      ${event.winner ?? null},
      now(),
      now(),
      now()
    )
    ON CONFLICT (game_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      moves = EXCLUDED.moves,
      fen = EXCLUDED.fen,
      wtime = EXCLUDED.wtime,
      btime = EXCLUDED.btime,
      winc = EXCLUDED.winc,
      binc = EXCLUDED.binc,
      winner = EXCLUDED.winner,
      last_move_at = EXCLUDED.last_move_at,
      last_clock_update_at = EXCLUDED.last_clock_update_at,
      updated_at = EXCLUDED.updated_at
    RETURNING game_id, lichess_user_id, status, moves, fen, wtime, btime, winc, binc, winner, last_move_at, last_clock_update_at, my_color, opponent_name, opponent_rating, initial_time_ms, initial_increment_ms
  `) as Array<{
    game_id: string
    lichess_user_id: string
    status: string
    moves: string
    fen: string
    wtime: number
    btime: number
    winc: number
    binc: number
    winner: 'white' | 'black' | null
    last_move_at: Date | null
    last_clock_update_at: Date | null
    my_color: 'white' | 'black' | null
    opponent_name: string | null
    opponent_rating: number | null
    initial_time_ms: number | null
    initial_increment_ms: number | null
  }>

  const row = rows[0]
  return {
    gameId: row.game_id,
    lichessUserId: row.lichess_user_id,
    status: row.status,
    moves: row.moves,
    fen: row.fen,
    wtime: row.wtime,
    btime: row.btime,
    winc: row.winc,
    binc: row.binc,
    winner: row.winner ?? undefined,
    lastMoveAt: row.last_move_at,
    lastClockUpdateAt: row.last_clock_update_at,
    myColor: row.my_color ?? 'white',
    opponentName: row.opponent_name,
    opponentRating: row.opponent_rating,
    initialTimeMs: row.initial_time_ms,
    initialIncrementMs: row.initial_increment_ms
  }
}

export async function recordGameFinish(lichessUserId: string, event: LichessGameFinishEvent): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  const statusStr = typeof event.game.status === 'string' ? event.game.status : JSON.stringify(event.game.status)
  
  await sql`
    UPDATE lichess_board_sessions
    SET status = 'finished', active_game_id = null, last_event_at = now(), updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `

  await sql`
    UPDATE lichess_game_states
    SET status = ${statusStr}, winner = ${event.game.winner ?? null}, updated_at = now()
    WHERE game_id = ${event.game.id}
  `
}

export async function updateSessionError(lichessUserId: string, message: string): Promise<void> {
  await connectToDb()
  const sql = getSql()
  await sql`
    UPDATE lichess_board_sessions
    SET status = 'error', last_error = ${message}, updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `
}

export async function setSessionStatus(lichessUserId: string, status: LichessBoardSession['status'], message?: string | null): Promise<void> {
  await connectToDb()
  const sql = getSql()
  await sql`
    UPDATE lichess_board_sessions
    SET status = ${status}, last_error = ${message ?? null}, updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `
}

export async function clearActiveGame(lichessUserId: string): Promise<{ clearedGameId: string | null }> {
  await connectToDb()
  const sql = getSql()

  const rows = (await sql`
    SELECT active_game_id
    FROM lichess_board_sessions
    WHERE lichess_user_id = ${lichessUserId}
    LIMIT 1
  `) as Array<{ active_game_id: string | null }>

  const activeGameId = rows[0]?.active_game_id ?? null

  await sql`
    UPDATE lichess_board_sessions
    SET active_game_id = null, status = 'connected', last_error = null, updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `

  // If we had a "playing" row stuck, mark it as aborted so it won't be treated as live forever.
  if (activeGameId) {
    await sql`
      UPDATE lichess_game_states
      SET status = 'aborted', updated_at = now()
      WHERE lichess_user_id = ${lichessUserId}
        AND game_id = ${activeGameId}
        AND status IN ('started', 'playing')
    `
  }

  return { clearedGameId: activeGameId }
}

export async function getSession(lichessUserId: string): Promise<LichessBoardSession | null> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT id, lichess_user_id, status, active_game_id, last_event_at, last_error
    FROM lichess_board_sessions
    WHERE lichess_user_id = ${lichessUserId}
  `) as Array<{
    id: string
    lichess_user_id: string
    status: string
    active_game_id: string | null
    last_event_at: Date | null
    last_error: string | null
  }>

  if (rows.length === 0) return null
  const row = rows[0]
  return {
    id: row.id,
    lichessUserId: row.lichess_user_id,
    status: row.status as LichessBoardSession['status'],
    activeGameId: row.active_game_id,
    lastEventAt: row.last_event_at,
    lastError: row.last_error
  }
}

export async function recordChatMessage(
  lichessUserId: string,
  event: LichessChatLineEvent,
  gameIdOverride?: string
): Promise<void> {
  await connectToDb()
  const sql = getSql()
  
  const activeGameId =
    gameIdOverride ??
    (
      ((
        await sql`
          SELECT active_game_id
          FROM lichess_board_sessions
          WHERE lichess_user_id = ${lichessUserId}
        `
      ) as Array<{ active_game_id: string | null }>)[0]?.active_game_id ?? null
    )
  if (!activeGameId) return

  await sql`
    INSERT INTO lichess_chat_messages (
      game_id, lichess_user_id, room, username, text, received_at
    ) VALUES (
      ${activeGameId}, ${lichessUserId}, ${event.room}, ${event.username}, ${event.text}, now()
    )
  `
}

export async function getActiveGameState(lichessUserId: string): Promise<LichessGameState | null> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT game_id, lichess_user_id, status, moves, fen, wtime, btime, winc, binc, winner, last_move_at, last_clock_update_at, my_color, opponent_name, opponent_rating, initial_time_ms, initial_increment_ms
    FROM lichess_game_states
    WHERE lichess_user_id = ${lichessUserId}
    ORDER BY 
      CASE WHEN status IN ('started', 'playing') THEN 1 ELSE 0 END DESC,
      updated_at DESC
    LIMIT 1
  `) as Array<{
    game_id: string
    lichess_user_id: string
    status: string
    moves: string
    fen: string
    wtime: number
    btime: number
    winc: number
    binc: number
    winner: 'white' | 'black' | null
    last_move_at: Date | null
    last_clock_update_at: Date | null
    my_color: 'white' | 'black' | null
    opponent_name: string | null
    opponent_rating: number | null
    initial_time_ms: number | null
    initial_increment_ms: number | null
  }>

  if (rows.length === 0 || !['started', 'playing'].includes(rows[0].status)) {
    // No active game in DB. Try to sync from Lichess to discover any missed starts.
    // This is especially important in serverless environments where the stream handler dies.
    // We don't await this to avoid blocking the polling route.
    syncActiveGames(lichessUserId).catch(() => null)
    
    // If we discovered a game in a previous background sync, the next query will find it.
  }

  if (rows.length === 0) return null
  const row = rows[0]

  const chatRows = (await sql`
    SELECT username, text, room, received_at
    FROM lichess_chat_messages
    WHERE game_id = ${row.game_id}
    ORDER BY received_at ASC
  `) as Array<{ username: string, text: string, room: string, received_at: Date }>

  return {
    gameId: row.game_id,
    lichessUserId: row.lichess_user_id,
    status: row.status,
    moves: row.moves,
    fen: row.fen,
    wtime: row.wtime,
    btime: row.btime,
    winc: row.winc,
    binc: row.binc,
    winner: row.winner ?? undefined,
    lastMoveAt: row.last_move_at,
    lastClockUpdateAt: row.last_clock_update_at,
    myColor: row.my_color ?? 'white',
    opponentName: row.opponent_name,
    opponentRating: row.opponent_rating,
    initialTimeMs: row.initial_time_ms,
    initialIncrementMs: row.initial_increment_ms,
    chatMessages: chatRows.map(c => ({
      username: c.username,
      text: c.text,
      room: c.room,
      receivedAt: c.received_at
    }))
  }
}
