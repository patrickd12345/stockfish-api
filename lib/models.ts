import { getSql } from '@/lib/database'
import { embedGame, toVectorString } from '@/lib/embeddings'

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
    SELECT id, date, white, black, result, opening_name, my_accuracy, blunders
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
  }))
}

export async function createGame(data: CreateGameInput): Promise<void> {
  const sql = getSql()
  const embedding = await embedGame({
    date: data.date,
    white: data.white,
    black: data.black,
    result: data.result,
    opening_name: data.opening_name,
    my_accuracy: data.my_accuracy,
    blunders: data.blunders,
    pgn_text: data.pgn_text,
  })
  const embeddingValue = embedding ? toVectorString(embedding) : null
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
      ${data.moves}::jsonb,
      ${embeddingValue}::vector
    )
  `
}

export async function getGamePgn(id: string): Promise<string | null> {
  const sql = getSql()
  const rows = (await sql`
    SELECT pgn_text FROM games WHERE id = ${id}
  `) as DbRow[]
  return (rows[0]?.pgn_text as string) ?? null
}

export async function searchGamesByEmbedding(embedding: number[], limit = 5) {
  const sql = getSql()
  const embeddingValue = toVectorString(embedding)
  const rows = (await sql`
    SELECT id,
      date,
      white,
      black,
      result,
      opening_name,
      my_accuracy,
      blunders,
      (1 - (embedding <=> ${embeddingValue}::vector)) AS similarity
    FROM games
    WHERE embedding IS NOT NULL
    ORDER BY embedding <=> ${embeddingValue}::vector
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
    similarity: r.similarity ?? null,
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
