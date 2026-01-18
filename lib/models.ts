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
  white?: string
  black?: string
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
  white?: string
  black?: string
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

export async function getGames(limit = 100) {
  const sql = getSql()
  const rows = (await sql`
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, created_at
    FROM games
    ORDER BY date DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ?? undefined,
    white: r.white ?? undefined,
    black: r.black ?? undefined,
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
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    ORDER BY date DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ? String(r.date) : undefined,
    white: r.white ? String(r.white) : undefined,
    black: r.black ? String(r.black) : undefined,
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
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, created_at
    FROM games
    WHERE date IS NOT NULL OR created_at IS NOT NULL
    ORDER BY created_at DESC
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
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, created_at
    FROM games
    WHERE 
      white ILIKE ${searchTerm} OR 
      black ILIKE ${searchTerm} OR 
      opening_name ILIKE ${searchTerm} OR
      date ILIKE ${searchTerm}
    ORDER BY date DESC, created_at DESC
    LIMIT ${limit}
  `) as DbRow[]
  return rows.map((r: DbRow) => ({
    id: String(r.id),
    date: r.date ?? undefined,
    white: r.white ?? undefined,
    black: r.black ?? undefined,
    result: r.result ?? undefined,
    opening_name: r.opening_name ?? undefined,
    my_accuracy: r.my_accuracy ?? undefined,
    blunders: r.blunders ?? 0,
    pgn_text: r.pgn_text,
    createdAt: r.created_at,
  }))
}

export async function createGame(data: CreateGameInput): Promise<string> {
  const sql = getSql()
  
  if (data.embedding && data.embedding.length > 0) {
    const embeddingStr = toVectorString(data.embedding)
    // Cast the text parameter to vector type
    const rows = (await sql`
      INSERT INTO games (date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, moves, embedding)
      VALUES (
        ${data.date ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
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
      INSERT INTO games (date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, moves)
      VALUES (
        ${data.date ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
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

export async function searchGamesByEmbedding(embedding: number[], limit = 5) {
  const sql = getSql()
  // pgvector accepts array format [1,2,3] - we'll pass it as a parameter and cast it
  const embeddingStr = toVectorString(embedding)
  
  // Use template literal - the embedding string is safe since it's generated from numbers
  // We need to cast the parameter to vector type
  const rows = (await sql`
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, created_at,
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
