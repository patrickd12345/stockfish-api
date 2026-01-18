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

export interface SummaryPayload {
  summary: unknown
  summaryText: string
  coveragePercent: number
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

const SUMMARY_FALLBACK_KEYS = [
  'summary',
  'summary_json',
  'summary_text',
  'engine_summary',
  'progression_summary',
  'data',
  'payload',
]

const COVERAGE_KEYS = [
  'coverage_percent',
  'coveragePercent',
  'coverage_pct',
  'coverage',
  'coverage_rate',
  'coverageRate',
]

function pickValue(source: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) {
      return source[key]
    }
  }
  return undefined
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed) {
      const parsed = Number(trimmed)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function formatSummaryText(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value === 'string') {
    return value
  }
  try {
    const serialized = JSON.stringify(value, null, 2)
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

function extractCoveragePercent(row: DbRow, summary: unknown): number {
  const summaryCoverage =
    summary && typeof summary === 'object'
      ? pickValue(summary as Record<string, unknown>, COVERAGE_KEYS)
      : undefined
  const rowCoverage = pickValue(row, COVERAGE_KEYS)
  const coverage = summaryCoverage ?? rowCoverage
  return toNumber(coverage) ?? 0
}

function buildSummaryPayload(
  row: DbRow,
  summaryKeys: string[]
): SummaryPayload {
  const rawSummary = pickValue(row, summaryKeys) ?? pickValue(row, SUMMARY_FALLBACK_KEYS)
  const parsedSummary = parseMaybeJson(rawSummary)
  const summaryValue = parsedSummary ?? rawSummary ?? row
  return {
    summary: summaryValue,
    summaryText: formatSummaryText(summaryValue),
    coveragePercent: extractCoveragePercent(row, summaryValue),
  }
}

export async function getLatestEngineSummary(): Promise<SummaryPayload | null> {
  const sql = getSql()
  const rows = (await sql`SELECT * FROM engine_summaries LIMIT 1`) as DbRow[]
  if (!rows.length) {
    return null
  }
  return buildSummaryPayload(rows[0], ['engine_summary', 'summary', 'summary_json', 'summary_text'])
}

export async function getLatestProgressionSummary(): Promise<SummaryPayload | null> {
  const sql = getSql()
  const rows = (await sql`SELECT * FROM progression_summaries LIMIT 1`) as DbRow[]
  if (!rows.length) {
    return null
  }
  return buildSummaryPayload(rows[0], ['progression_summary', 'summary', 'summary_json', 'summary_text'])
}
