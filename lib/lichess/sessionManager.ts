import { connectToDb, getSql } from '@/lib/database'
import { deriveFenFromMoves } from '@/lib/lichess/fen'
import { LichessGameFinishEvent, LichessGameStartEvent, LichessGameStateEvent, LichessGameState, LichessBoardSession } from '@/lib/lichess/types'

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
      last_clock_update_at
    ) VALUES (
      ${gameId},
      ${lichessUserId},
      'started',
      '',
      ${deriveFenFromMoves('')},
      ${event.game.clock?.initial ?? 0},
      ${event.game.clock?.initial ?? 0},
      ${event.game.clock?.increment ?? 0},
      ${event.game.clock?.increment ?? 0},
      null,
      now()
    )
    ON CONFLICT (game_id)
    DO UPDATE SET
      status = 'started',
      updated_at = now()
  `
}

export async function recordGameState(lichessUserId: string, event: LichessGameStateEvent): Promise<LichessGameState> {
  await connectToDb()
  const sql = getSql()
  const sessionRows = (await sql`
    SELECT active_game_id
    FROM lichess_board_sessions
    WHERE lichess_user_id = ${lichessUserId}
  `) as Array<{ active_game_id: string | null }>
  const activeGameId = sessionRows[0]?.active_game_id
  if (!activeGameId) {
    throw new Error('No active game to update')
  }
  const fen = deriveFenFromMoves(event.moves)
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
      ${event.status},
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
    RETURNING game_id, lichess_user_id, status, moves, fen, wtime, btime, winc, binc, winner, last_move_at, last_clock_update_at
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
    lastClockUpdateAt: row.last_clock_update_at
  }
}

export async function recordGameFinish(lichessUserId: string, event: LichessGameFinishEvent): Promise<void> {
  await connectToDb()
  const sql = getSql()
  await sql`
    UPDATE lichess_board_sessions
    SET status = 'finished', active_game_id = null, last_event_at = now(), updated_at = now()
    WHERE lichess_user_id = ${lichessUserId}
  `

  await sql`
    UPDATE lichess_game_states
    SET status = ${event.game.status}, winner = ${event.game.winner ?? null}, updated_at = now()
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

export async function getActiveGameState(lichessUserId: string): Promise<LichessGameState | null> {
  await connectToDb()
  const sql = getSql()
  const rows = (await sql`
    SELECT game_id, lichess_user_id, status, moves, fen, wtime, btime, winc, binc, winner, last_move_at, last_clock_update_at
    FROM lichess_game_states
    WHERE lichess_user_id = ${lichessUserId}
    ORDER BY updated_at DESC
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
  }>

  if (rows.length === 0) return null
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
    lastClockUpdateAt: row.last_clock_update_at
  }
}
