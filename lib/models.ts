import { getSql } from '@/lib/database'
import { toVectorString } from '@/lib/embeddings'

export interface IMove {
  move_number: number
  ply: number
  fen: string
  move_san: string
  engine_eval?: number
  is_blunder: boolean
}

export interface IGame {
  id: string
  date?: string
  time?: string
  white?: string
  black?: string
  white_elo?: number | null
  black_elo?: number | null
  result?: string
  opening_name?: string
  my_accuracy?: number
  blunders: number
  pgn_text: string
  moves: IMove[]
  createdAt: Date
}

export interface CreateGameInput {
  date?: string
  time?: string
  white?: string
  black?: string
  white_elo?: number | null
  black_elo?: number | null
  result?: string
  opening_name?: string
  my_accuracy?: number
  blunders: number
  pgn_text: string
  moves: IMove[]
  embedding?: number[] | null
}

export interface SummaryPayload {
  summary: unknown
  summaryText: string
  coveragePercent: number
}

export interface GameAnalysisPayload {
  pgn: string
  moves: IMove[]
  pvSnapshots: any[]
  engineVersion: string | null
  analysisDepth: number | null
  avgCentipawnLoss: number | null
  blunders: number | null
  mistakes: number | null
  inaccuracies: number | null
  evalSwingMax: number | null
  openingCpl: number | null
  middlegameCpl: number | null
  endgameCpl: number | null
  gameLength: number | null
}

export interface OpeningStatsRow {
  openingName: string
  games: number
  wins: number
  losses: number
  draws: number
  whiteScore: number
}

type DbRow = Record<string, unknown>

export type RatingBandRow = {
  bandStart: number
  bandEnd: number
  games: number
  wins: number
  losses: number
  draws: number
  winRate: number
}

export async function getOpponentRatingBandPerformance(
  bandSize: number = 200,
  minGamesPerBand: number = 50
): Promise<
  | {
      note: string
      overallWinRate: number
      overallGames: number
      bands: RatingBandRow[]
    }
  | {
      overallWinRate: number
      overallGames: number
      bands: RatingBandRow[]
      note?: undefined
    }
> {
  const sql = getSql()
  const rawBand = Number(bandSize)
  const band = Number.isFinite(rawBand) && rawBand > 0 ? Math.trunc(rawBand) : 200

  const playerNames = [
    process.env.CHESS_PLAYER_NAMES?.split(',') || [],
    ['patrickd1234567', 'patrickd12345678', 'anonymous19670705'],
  ]
    .flat()
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  const playerPatterns = playerNames.map((name) => `%${name}%`)

  // If Elo columns are missing (migration not run), fail gracefully.
  const colCheck = (await sql`
    SELECT
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'games'
          AND column_name = 'white_elo'
      ) AS has_white_elo,
      EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'games'
          AND column_name = 'black_elo'
      ) AS has_black_elo
  `) as Array<{ has_white_elo: boolean; has_black_elo: boolean }>

  if (!colCheck[0]?.has_white_elo || !colCheck[0]?.has_black_elo) {
    return {
      note: 'Ratings are not stored yet (missing games.white_elo / games.black_elo).',
      overallWinRate: 0,
      overallGames: 0,
      bands: [],
    }
  }

  const rows = (await sql`
    WITH mine AS (
      SELECT
        id,
        result,
        CASE
          WHEN white ILIKE ANY(${playerPatterns}) THEN 'white'
          WHEN black ILIKE ANY(${playerPatterns}) THEN 'black'
          ELSE NULL
        END AS my_color,
        white_elo,
        black_elo
      FROM games
      WHERE (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
        AND pgn_text IS NOT NULL
        AND pgn_text != ''
    ),
    with_opp AS (
      SELECT
        CASE
          WHEN my_color = 'white' THEN black_elo
          WHEN my_color = 'black' THEN white_elo
          ELSE NULL
        END AS opp_elo,
        CASE
          WHEN my_color = 'white' AND result = '1-0' THEN 1
          WHEN my_color = 'black' AND result = '0-1' THEN 1
          WHEN result = '1/2-1/2' THEN 0.5
          WHEN result IS NULL THEN NULL
          ELSE 0
        END AS score,
        CASE
          WHEN my_color = 'white' AND result = '1-0' THEN 1
          WHEN my_color = 'black' AND result = '0-1' THEN 1
          ELSE 0
        END AS is_win,
        CASE
          WHEN my_color = 'white' AND result = '0-1' THEN 1
          WHEN my_color = 'black' AND result = '1-0' THEN 1
          ELSE 0
        END AS is_loss,
        CASE WHEN result = '1/2-1/2' THEN 1 ELSE 0 END AS is_draw
      FROM mine
      WHERE my_color IS NOT NULL
    ),
    filtered AS (
      SELECT *
      FROM with_opp
      WHERE opp_elo IS NOT NULL
        AND score IS NOT NULL
        AND opp_elo BETWEEN 0 AND 10000
    ),
    overall AS (
      SELECT
        COUNT(*)::int AS games,
        COALESCE(AVG(score), 0)::float AS win_rate
      FROM filtered
    ),
    bands AS (
      SELECT
        (FLOOR(opp_elo::float / ${band}) * ${band})::int AS band_start,
        COUNT(*)::int AS games,
        SUM(is_win)::int AS wins,
        SUM(is_loss)::int AS losses,
        SUM(is_draw)::int AS draws,
        COALESCE(AVG(score), 0)::float AS win_rate
      FROM filtered
      GROUP BY 1
    )
    SELECT
      o.games AS overall_games,
      o.win_rate AS overall_win_rate,
      b.band_start,
      b.games,
      b.wins,
      b.losses,
      b.draws,
      b.win_rate
    FROM overall o
    JOIN bands b ON true
    WHERE b.games >= ${Math.max(1, Math.trunc(minGamesPerBand))}
    ORDER BY b.band_start ASC
  `) as Array<{
    overall_games: number
    overall_win_rate: number
    band_start: number
    games: number
    wins: number
    losses: number
    draws: number
    win_rate: number
  }>

  if (rows.length === 0) {
    // Could be because Elos not backfilled yet, or too few games with Elo.
    const overall = (await sql`
      WITH mine AS (
        SELECT
          result,
          CASE
            WHEN white ILIKE ANY(${playerPatterns}) THEN 'white'
            WHEN black ILIKE ANY(${playerPatterns}) THEN 'black'
            ELSE NULL
          END AS my_color,
          white_elo,
          black_elo
        FROM games
        WHERE (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
          AND pgn_text IS NOT NULL
          AND pgn_text != ''
      ),
      with_opp AS (
        SELECT
          CASE
            WHEN my_color = 'white' THEN black_elo
            WHEN my_color = 'black' THEN white_elo
            ELSE NULL
          END AS opp_elo,
          CASE
            WHEN my_color = 'white' AND result = '1-0' THEN 1
            WHEN my_color = 'black' AND result = '0-1' THEN 1
            WHEN result = '1/2-1/2' THEN 0.5
            WHEN result IS NULL THEN NULL
            ELSE 0
          END AS score
        FROM mine
        WHERE my_color IS NOT NULL
      )
      SELECT
        COUNT(*) FILTER (WHERE opp_elo IS NOT NULL)::int AS games,
        COALESCE(AVG(score) FILTER (WHERE opp_elo IS NOT NULL), 0)::float AS win_rate
      FROM with_opp
    `) as Array<{ games: number; win_rate: number }>

    return {
      note:
        'Not enough games with Elo to compute rating bands yet. Run: npx tsx scripts/backfill-game-ratings.ts',
      overallWinRate: Number(overall[0]?.win_rate || 0),
      overallGames: Number(overall[0]?.games || 0),
      bands: [],
    }
  }

  const overallGames = Number(rows[0]?.overall_games || 0)
  const overallWinRate = Number(rows[0]?.overall_win_rate || 0)
  const bands: RatingBandRow[] = rows.map((r) => ({
    bandStart: Number(r.band_start),
    bandEnd: Number(r.band_start) + band - 1,
    games: Number(r.games),
    wins: Number(r.wins),
    losses: Number(r.losses),
    draws: Number(r.draws),
    winRate: Number(r.win_rate),
  }))

  return { overallWinRate, overallGames, bands }
}

export type LichessGameSummary = {
  id: string
  lichess_game_id: string
  lichess_user_id: string
  status: string
  moves_uci: string
  fen: string
  // UI compatibility fields (matches `games` table shape where possible).
  date?: string
  white?: string
  black?: string
  result?: string
  opening_name?: string
  winner?: string
  last_move_at?: string
  createdAt: Date
}

export async function getGames(limit = 100) {
  const sql = getSql()
  const rows = (await sql`
    SELECT id, date, time, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, pgn_text, created_at
    FROM games
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ?? undefined,
    time: r.time ?? undefined,
    white: r.white ?? undefined,
    black: r.black ?? undefined,
    white_elo: typeof r.white_elo === 'number' ? r.white_elo : r.white_elo === null ? null : r.white_elo ? Number(r.white_elo) : null,
    black_elo: typeof r.black_elo === 'number' ? r.black_elo : r.black_elo === null ? null : r.black_elo ? Number(r.black_elo) : null,
    result: r.result ?? undefined,
    opening_name: r.opening_name ?? undefined,
    my_accuracy: r.my_accuracy ?? undefined,
    blunders: r.blunders ?? 0,
    pgn_text: r.pgn_text,
    createdAt: r.created_at,
  }))
}

export async function getGameSummaries(limit = 10) {
  const sql = getSql()
  const rows = (await sql`
    SELECT id, date, time, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ? String(r.date) : undefined,
    time: r.time ? String(r.time) : undefined,
    white: r.white ? String(r.white) : undefined,
    black: r.black ? String(r.black) : undefined,
    white_elo: r.white_elo === null || r.white_elo === undefined ? null : Number(r.white_elo),
    black_elo: r.black_elo === null || r.black_elo === undefined ? null : Number(r.black_elo),
    result: r.result ? String(r.result) : undefined,
    opening_name: r.opening_name ? String(r.opening_name) : undefined,
    my_accuracy: r.my_accuracy ? Number(r.my_accuracy) : undefined,
    blunders: Number(r.blunders ?? 0),
    createdAt: r.created_at as Date,
  }))
}

export async function getGameSummariesByDateRange(startDate: string, endDate: string, limit = 5000) {
  const sql = getSql()
  // Normalize dates - handle both YYYY-MM-DD and YYYY.MM.DD formats
  const normalizeDate = (dateStr: string) => dateStr.replace(/\./g, '-')
  const start = normalizeDate(startDate)
  const end = normalizeDate(endDate)
  
  console.log(`📅 Querying games from ${start} to ${end}`)
  
  // Query with date range filter at database level
  // Handle both date formats: YYYY-MM-DD and YYYY.MM.DD (Chess.com format)
  // We'll fetch all games and filter in code to handle date format variations
  // This is more reliable than complex SQL CASE statements
  const allRows = (await sql`
    SELECT id, date, time, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    WHERE date IS NOT NULL OR created_at IS NOT NULL
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT 10000
  `) as DbRow[]
  
  console.log(`📊 Fetched ${allRows.length} total games from database`)
  
  // Filter in code to handle date format variations
  const startDateObj = new Date(start + 'T00:00:00Z')
  const endDateObj = new Date(end + 'T23:59:59Z')
  
  console.log(`🔍 Date range: ${startDateObj.toISOString()} to ${endDateObj.toISOString()}`)
  
  // Debug: show sample dates
  if (allRows.length > 0) {
    console.log(`📋 Sample dates from first 10 games:`)
    allRows.slice(0, 10).forEach((r, i) => {
      console.log(`  ${i + 1}. date="${r.date}" created_at="${r.created_at}"`)
    })
  }
  
  const filteredRows = allRows.filter((r: DbRow) => {
    if (r.date) {
      // Normalize date format
      const dateStr = String(r.date).replace(/\./g, '-').split('T')[0].split(' ')[0]
      const gameDate = new Date(dateStr + 'T00:00:00Z')
      if (!isNaN(gameDate.getTime())) {
        return gameDate >= startDateObj && gameDate <= endDateObj
      }
    }
    // Fallback to created_at if date is null
    if (r.created_at) {
      const createdDate = new Date(r.created_at as Date)
      const createdDateOnly = new Date(createdDate.getFullYear(), createdDate.getMonth(), createdDate.getDate())
      const startDateOnly = new Date(startDateObj.getFullYear(), startDateObj.getMonth(), startDateObj.getDate())
      const endDateOnly = new Date(endDateObj.getFullYear(), endDateObj.getMonth(), endDateObj.getDate())
      return createdDateOnly >= startDateOnly && createdDateOnly <= endDateOnly
    }
    return false
  }).slice(0, limit)
  
  console.log(`✅ Filtered to ${filteredRows.length} games in date range`)
  
  return filteredRows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ? String(r.date) : undefined,
    white: r.white ? String(r.white) : undefined,
    black: r.black ? String(r.black) : undefined,
    white_elo: r.white_elo === null || r.white_elo === undefined ? null : Number(r.white_elo),
    black_elo: r.black_elo === null || r.black_elo === undefined ? null : Number(r.black_elo),
    result: r.result ? String(r.result) : undefined,
    opening_name: r.opening_name ? String(r.opening_name) : undefined,
    my_accuracy: r.my_accuracy ? Number(r.my_accuracy) : undefined,
    blunders: Number(r.blunders ?? 0),
    createdAt: r.created_at as Date,
  }))
}

export async function getGameCount(): Promise<number> {
  const sql = getSql()
  const rows = (await sql`
    SELECT COUNT(*)::int AS count
    FROM games
  `) as DbRow[]
  return Number(rows[0]?.count ?? 0)
}

export async function searchGames(query: string, limit = 50) {
  const sql = getSql()
  const searchTerm = `%${query}%`
  const rows = (await sql`
    SELECT id, date, time, white, black, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    WHERE 
      white ILIKE ${searchTerm} OR 
      black ILIKE ${searchTerm} OR 
      opening_name ILIKE ${searchTerm} OR
      date ILIKE ${searchTerm}
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ?? undefined,
    time: r.time ?? undefined,
    white: r.white ?? undefined,
    black: r.black ?? undefined,
    result: r.result ?? undefined,
    opening_name: r.opening_name ?? undefined,
    my_accuracy: r.my_accuracy ?? undefined,
    blunders: r.blunders ?? 0,
    pgn_text: undefined as string | undefined,
    createdAt: r.created_at,
  }))
}

export async function getGamesByOpeningOutcome(
  opening: string,
  outcome: string,
  limit = 500
) {
  const sql = getSql()
  const openingTerm = opening
  const playerNames = [
    process.env.CHESS_PLAYER_NAMES?.split(',') || [],
    ['patrickd1234567', 'patrickd12345678', 'anonymous19670705'],
  ]
    .flat()
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  const playerPatterns = playerNames.map((name) => `%${name}%`)

  const rows = (await sql`
    SELECT id, date, time, white, black, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    WHERE opening_name ILIKE ${openingTerm}
      AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
      AND (
        CASE
          WHEN ${outcome} = 'all' THEN true
          WHEN ${outcome} = 'win' THEN (
            (result = '1-0' AND white ILIKE ANY(${playerPatterns})) OR
            (result = '0-1' AND black ILIKE ANY(${playerPatterns}))
          )
          WHEN ${outcome} = 'loss' THEN (
            (result = '1-0' AND black ILIKE ANY(${playerPatterns})) OR
            (result = '0-1' AND white ILIKE ANY(${playerPatterns}))
          )
          WHEN ${outcome} = 'draw' THEN (
            result = '1/2-1/2' AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
          )
          ELSE false
        END
      )
    ORDER BY date DESC, time DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]

  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ?? undefined,
    time: r.time ?? undefined,
    white: r.white ?? undefined,
    black: r.black ?? undefined,
    result: r.result ?? undefined,
    opening_name: r.opening_name ?? undefined,
    my_accuracy: r.my_accuracy ?? undefined,
    blunders: r.blunders ?? 0,
    pgn_text: undefined as string | undefined,
    createdAt: r.created_at,
  }))
}

export async function getGamesByOpeningOutcomeCount(opening: string, outcome: string) {
  const sql = getSql()
  const openingTerm = opening
  const playerNames = [
    process.env.CHESS_PLAYER_NAMES?.split(',') || [],
    ['patrickd1234567', 'patrickd12345678', 'anonymous19670705'],
  ]
    .flat()
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  const playerPatterns = playerNames.map((name) => `%${name}%`)

  const rows = (await sql`
    SELECT COUNT(*)::int AS total
    FROM games
    WHERE opening_name ILIKE ${openingTerm}
      AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
      AND (
        CASE
          WHEN ${outcome} = 'all' THEN true
          WHEN ${outcome} = 'win' THEN (
            (result = '1-0' AND white ILIKE ANY(${playerPatterns})) OR
            (result = '0-1' AND black ILIKE ANY(${playerPatterns}))
          )
          WHEN ${outcome} = 'loss' THEN (
            (result = '1-0' AND black ILIKE ANY(${playerPatterns})) OR
            (result = '0-1' AND white ILIKE ANY(${playerPatterns}))
          )
          WHEN ${outcome} = 'draw' THEN (
            result = '1/2-1/2' AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
          )
          ELSE false
        END
      )
  `) as DbRow[]

  return Number(rows[0]?.total ?? 0)
}

export async function createGame(data: CreateGameInput): Promise<string> {
  const sql = getSql()
  
  if (data.embedding && data.embedding.length > 0) {
    const embeddingStr = toVectorString(data.embedding)
    // Cast the text parameter to vector type
    const rows = (await sql`
      INSERT INTO games (date, time, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, pgn_text, moves, embedding)
      VALUES (
        ${data.date ?? null},
        ${data.time ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
        ${typeof data.white_elo === 'number' ? data.white_elo : null},
        ${typeof data.black_elo === 'number' ? data.black_elo : null},
        ${data.result ?? null},
        ${data.opening_name ?? null},
        ${data.my_accuracy ?? null},
        ${data.blunders ?? -1},
        ${data.pgn_text},
        ${JSON.stringify(data.moves)},
        (${embeddingStr}::text::vector)
      )
      RETURNING id
    `) as DbRow[]
    return String(rows[0]?.id)
  } else {
    const rows = (await sql`
      INSERT INTO games (date, time, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, pgn_text, moves)
      VALUES (
        ${data.date ?? null},
        ${data.time ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
        ${typeof data.white_elo === 'number' ? data.white_elo : null},
        ${typeof data.black_elo === 'number' ? data.black_elo : null},
        ${data.result ?? null},
        ${data.opening_name ?? null},
        ${data.my_accuracy ?? null},
        ${data.blunders ?? -1},
        ${data.pgn_text},
        ${JSON.stringify(data.moves)}
      )
      RETURNING id
    `) as DbRow[]
    return String(rows[0]?.id)
  }
}

export async function getGamePgn(id: string): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT pgn_text FROM games WHERE id = ${id}
  `) as DbRow[]
  return (rows[0]?.pgn_text as string) ?? null
}

export async function getGameAnalysisData(id: string): Promise<GameAnalysisPayload | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT pgn_text, moves
    FROM games
    WHERE id = ${id}
  `) as DbRow[]
  if (!rows[0]) {
    return null
  }

  const analysisRows = (await sql`
    SELECT
      pv_snapshots,
      engine_version,
      analysis_depth,
      avg_centipawn_loss,
      blunders,
      mistakes,
      inaccuracies,
      eval_swing_max,
      opening_cpl,
      middlegame_cpl,
      endgame_cpl,
      game_length
    FROM engine_analysis
    WHERE game_id = ${id}
      AND analysis_failed = false
    ORDER BY analyzed_at DESC
    LIMIT 1
  `) as DbRow[]

  const rawMoves = rows[0].moves
  let moves: IMove[] = []
  if (Array.isArray(rawMoves)) {
    moves = rawMoves as IMove[]
  } else if (typeof rawMoves === 'string') {
    try {
      moves = JSON.parse(rawMoves) as IMove[]
    } catch {
      moves = []
    }
  } else if (rawMoves) {
    moves = rawMoves as IMove[]
  }

  const analysis = analysisRows[0] ?? {}

  return {
    pgn: String(rows[0].pgn_text ?? ''),
    moves,
    pvSnapshots: (analysis.pv_snapshots as any[]) ?? [],
    engineVersion: analysis.engine_version ? String(analysis.engine_version) : null,
    analysisDepth: analysis.analysis_depth ? Number(analysis.analysis_depth) : null,
    avgCentipawnLoss:
      analysis.avg_centipawn_loss === null || analysis.avg_centipawn_loss === undefined
        ? null
        : Number(analysis.avg_centipawn_loss),
    blunders: analysis.blunders === undefined ? null : Number(analysis.blunders),
    mistakes: analysis.mistakes === undefined ? null : Number(analysis.mistakes),
    inaccuracies: analysis.inaccuracies === undefined ? null : Number(analysis.inaccuracies),
    evalSwingMax:
      analysis.eval_swing_max === null || analysis.eval_swing_max === undefined
        ? null
        : Number(analysis.eval_swing_max),
    openingCpl:
      analysis.opening_cpl === null || analysis.opening_cpl === undefined ? null : Number(analysis.opening_cpl),
    middlegameCpl:
      analysis.middlegame_cpl === null || analysis.middlegame_cpl === undefined
        ? null
        : Number(analysis.middlegame_cpl),
    endgameCpl:
      analysis.endgame_cpl === null || analysis.endgame_cpl === undefined ? null : Number(analysis.endgame_cpl),
    gameLength: analysis.game_length === undefined ? null : Number(analysis.game_length),
  }
}

export async function getOpeningStats(limit = 100): Promise<OpeningStatsRow[]> {
  const sql = getSql()
  const playerNames = [
    process.env.CHESS_PLAYER_NAMES?.split(',') || [],
    ['patrickd1234567', 'patrickd12345678', 'anonymous19670705'],
  ]
    .flat()
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  const playerPatterns = playerNames.map((name) => `%${name}%`)

  const rows = (await sql`
    SELECT
      opening_name,
      COUNT(*)::int AS games,
      SUM(
        CASE
          WHEN result = '1-0' AND white ILIKE ANY(${playerPatterns}) THEN 1
          WHEN result = '0-1' AND black ILIKE ANY(${playerPatterns}) THEN 1
          ELSE 0
        END
      )::int AS wins,
      SUM(
        CASE
          WHEN result = '1-0' AND black ILIKE ANY(${playerPatterns}) THEN 1
          WHEN result = '0-1' AND white ILIKE ANY(${playerPatterns}) THEN 1
          ELSE 0
        END
      )::int AS losses,
      SUM(
        CASE
          WHEN result = '1/2-1/2' AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
            THEN 1
          ELSE 0
        END
      )::int AS draws
    FROM games
    WHERE opening_name IS NOT NULL
      AND opening_name != ''
      AND (white ILIKE ANY(${playerPatterns}) OR black ILIKE ANY(${playerPatterns}))
    GROUP BY opening_name
    ORDER BY games DESC
    LIMIT ${limit}
  `) as DbRow[]

  return rows.map((row) => {
    const games = Number(row.games ?? 0)
    const wins = Number(row.wins ?? 0)
    const losses = Number(row.losses ?? 0)
    const draws = Number(row.draws ?? 0)
    const whiteScore = games > 0 ? (wins + 0.5 * draws) / games : 0
    return {
      openingName: String(row.opening_name ?? 'Unknown'),
      games,
      wins,
      losses,
      draws,
      whiteScore,
    }
  })
}

export async function getLichessGameSummaries(limit = 50): Promise<LichessGameSummary[]> {
  const sql = getSql()
  const rows = (await sql`
    SELECT
      game_id,
      lichess_user_id,
      status,
      moves,
      fen,
      winner,
      last_move_at,
      updated_at
    FROM lichess_game_states
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as DbRow[]

  return rows.map((r: DbRow) => {
    const lastMoveAt = r.last_move_at ? String(r.last_move_at) : undefined
    const date = lastMoveAt ? lastMoveAt.split('T')[0] : undefined
    const lichessUserId = String(r.lichess_user_id ?? '')
    const status = String(r.status ?? 'unknown')
    const winner = r.winner ? String(r.winner) : undefined
    const result = winner ?? status

    return {
    id: `lichess:${String(r.game_id)}`,
    lichess_game_id: String(r.game_id),
    lichess_user_id: lichessUserId,
    status,
    moves_uci: String(r.moves ?? ''),
    fen: String(r.fen ?? 'start'),
    date,
    white: lichessUserId || 'Me',
    black: 'Lichess',
    result,
    winner,
    last_move_at: lastMoveAt,
    createdAt: (r.updated_at as Date) ?? new Date(),
    }
  })
}

export async function searchLichessGameSummaries(query: string, limit = 50): Promise<LichessGameSummary[]> {
  const sql = getSql()
  const term = `%${query}%`
  const rows = (await sql`
    SELECT
      game_id,
      lichess_user_id,
      status,
      moves,
      fen,
      winner,
      last_move_at,
      updated_at
    FROM lichess_game_states
    WHERE
      game_id ILIKE ${term}
      OR lichess_user_id ILIKE ${term}
      OR status ILIKE ${term}
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as DbRow[]

  return rows.map((r: DbRow) => {
    const lastMoveAt = r.last_move_at ? String(r.last_move_at) : undefined
    const date = lastMoveAt ? lastMoveAt.split('T')[0] : undefined
    const lichessUserId = String(r.lichess_user_id ?? '')
    const status = String(r.status ?? 'unknown')
    const winner = r.winner ? String(r.winner) : undefined
    const result = winner ?? status

    return {
    id: `lichess:${String(r.game_id)}`,
    lichess_game_id: String(r.game_id),
    lichess_user_id: lichessUserId,
    status,
    moves_uci: String(r.moves ?? ''),
    fen: String(r.fen ?? 'start'),
    date,
    white: lichessUserId || 'Me',
    black: 'Lichess',
    result,
    winner,
    last_move_at: lastMoveAt,
    createdAt: (r.updated_at as Date) ?? new Date(),
    }
  })
}

export async function searchGamesByEmbedding(embedding: number[], limit = 5) {
  const sql = getSql()
  // pgvector accepts array format [1,2,3] - we'll pass it as a parameter and cast it
  const embeddingStr = toVectorString(embedding)
  
  // Use template literal - the embedding string is safe since it's generated from numbers
  // We need to cast the parameter to vector type
  const rows = (await sql`
    SELECT id, date, white, black, white_elo, black_elo, result, opening_name, my_accuracy, blunders, pgn_text, created_at,
      embedding <-> (${embeddingStr}::text::vector) AS distance
    FROM games
    WHERE embedding IS NOT NULL
    ORDER BY embedding <-> (${embeddingStr}::text::vector)
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ? String(r.date) : undefined,
    white: r.white ? String(r.white) : undefined,
    black: r.black ? String(r.black) : undefined,
    white_elo: r.white_elo === null || r.white_elo === undefined ? null : Number(r.white_elo),
    black_elo: r.black_elo === null || r.black_elo === undefined ? null : Number(r.black_elo),
    result: r.result ? String(r.result) : undefined,
    opening_name: r.opening_name ? String(r.opening_name) : undefined,
    my_accuracy: r.my_accuracy ? Number(r.my_accuracy) : undefined,
    blunders: Number(r.blunders) ?? 0,
    pgn_text: String(r.pgn_text),
    createdAt: r.created_at,
    distance: r.distance ? Number(r.distance) : null,
  }))
}

export async function gameExists(
  date: string | undefined,
  white: string | undefined,
  black: string | undefined
): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    SELECT 1 FROM games
    WHERE date = ${date ?? null} AND white = ${white ?? null} AND black = ${black ?? null}
    LIMIT 1
  `) as DbRow[]
  return rows.length > 0
}

export async function gameExistsByPgnText(pgnText: string): Promise<boolean> {
  const sql = getSql()
  const rows = (await sql`
    SELECT 1 FROM games
    WHERE pgn_text = ${pgnText}
    LIMIT 1
  `) as DbRow[]
  return rows.length > 0
}
