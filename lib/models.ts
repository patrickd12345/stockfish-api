import { getSql } from '@/lib/database'

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

type DbRow = Record<string, unknown>

export async function getGames(limit = 100) {
  const sql = getSql()
  const rows = (await sql`
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, created_at
    FROM games
    ORDER BY created_at DESC
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
    ORDER BY created_at DESC
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
    ORDER BY created_at DESC
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

export async function createGame(data: CreateGameInput): Promise<void> {
  const sql = getSql()
  
  if (data.embedding && data.embedding.length > 0) {
    const embeddingStr = `[${data.embedding.join(',')}]`
    // Cast the text parameter to vector type
    await sql`
      INSERT INTO games (date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, moves, embedding)
      VALUES (
        ${data.date ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
        ${data.result ?? null},
        ${data.opening_name ?? null},
        ${data.my_accuracy ?? null},
        ${data.blunders ?? 0},
        ${data.pgn_text},
        ${JSON.stringify(data.moves)},
        (${embeddingStr}::text::vector)
      )
    `
  } else {
    await sql`
      INSERT INTO games (date, white, black, result, opening_name, my_accuracy, blunders, pgn_text, moves)
      VALUES (
        ${data.date ?? null},
        ${data.white ?? null},
        ${data.black ?? null},
        ${data.result ?? null},
        ${data.opening_name ?? null},
        ${data.my_accuracy ?? null},
        ${data.blunders ?? 0},
        ${data.pgn_text},
        ${JSON.stringify(data.moves)}
      )
    `
  }
}

export async function getGamePgn(id: string): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT pgn_text FROM games WHERE id = ${id}
  `) as DbRow[]
  return (rows[0]?.pgn_text as string) ?? null
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

export async function searchGamesByEmbedding(embedding: number[], limit = 5) {
  const sql = getSql()
  // pgvector accepts array format [1,2,3] - we'll pass it as a parameter and cast it
  const embeddingArray = embedding
  const embeddingStr = `[${embeddingArray.join(',')}]`
  
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
