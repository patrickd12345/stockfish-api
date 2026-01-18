#!/usr/bin/env tsx

import * as dotenv from 'dotenv'
import * as fs from 'fs'
import * as path from 'path'
import { Chess } from 'chess.js'

const envPath = path.resolve(process.cwd(), '.env.local')
if (fs.existsSync(envPath)) {
  let envRaw = fs.readFileSync(envPath, 'utf8')
  if (envRaw.charCodeAt(0) === 0xfeff) {
    envRaw = envRaw.slice(1)
  }
  const parsed = dotenv.parse(envRaw)
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_URL && !process.env.POSTGRES_PRISMA_URL) {
    const match = envRaw.match(/^\s*DATABASE_URL\s*=\s*(.+)\s*$/m)
    if (match && match[1]) {
      const rawValue = match[1].trim()
      const unquoted = rawValue.replace(/^['"]|['"]$/g, '')
      process.env.DATABASE_URL = unquoted
    }
  }
} else {
  dotenv.config({ path: envPath })
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { connectToDb, getSql } = require('../lib/database')

type GameRow = {
  id: string
  pgn_text: string
  created_at?: Date
}

async function backfillOpenings() {
  await connectToDb()
  const sql = getSql()

  let cursorCreatedAt = new Date('9999-12-31T23:59:59Z')
  let cursorId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  let batch = 0
  let processed = 0
  let updated = 0
  let skippedNoOpening = 0
  let skippedParseError = 0

  while (true) {
    const rows = (await sql`
      SELECT id, pgn_text, created_at
      FROM games
      WHERE (opening_name IS NULL OR opening_name = '')
        AND (
          created_at < ${cursorCreatedAt} OR
          (created_at = ${cursorCreatedAt} AND id < ${cursorId})
        )
      ORDER BY created_at DESC, id DESC
      LIMIT 200
    `) as (GameRow & { created_at: Date })[]

    if (rows.length === 0) break
    batch++
    console.log(`Processing batch ${batch} (${rows.length} games) ...`)

    for (const row of rows) {
      processed++
      const { openingName, parseError } = deriveOpeningNameFromPgn(row.pgn_text)
      if (parseError) {
        skippedParseError++
        continue
      }

      if (!openingName) {
        skippedNoOpening++
        continue
      }

      await sql`
        UPDATE games
        SET opening_name = ${openingName}
        WHERE id = ${row.id}
      `
      updated++
    }
    const last = rows[rows.length - 1]
    cursorCreatedAt = last.created_at
    cursorId = last.id
  }

  console.log('Backfill completed.')
  console.log(`Processed: ${processed}`)
  console.log(`Updated: ${updated}`)
  console.log(`Skipped (no opening): ${skippedNoOpening}`)
  console.log(`Skipped (parse error): ${skippedParseError}`)
}

function deriveOpeningNameFromPgn(pgnText: string): {
  openingName?: string
  parseError: boolean
} {
  const chess = new Chess()
  try {
    chess.loadPgn(pgnText)
  } catch {
    return { parseError: true }
  }

  const headers = chess.header()
  const opening = normalizeOpeningName(headers.Opening)
  if (opening) return { openingName: opening, parseError: false }

  const ecoUrlName = openingNameFromEcoUrl(headers.ECOUrl)
  if (ecoUrlName) return { openingName: ecoUrlName, parseError: false }

  const eco = normalizeOpeningName(headers.ECO)
  if (eco) return { openingName: `ECO ${eco}`, parseError: false }

  return { parseError: false }
}

function normalizeOpeningName(value?: string): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function openingNameFromEcoUrl(ecoUrl?: string): string | undefined {
  if (!ecoUrl) return undefined
  try {
    const trimmed = ecoUrl.trim()
    if (!trimmed) return undefined
    const parts = trimmed.split('/').filter(Boolean)
    const last = parts[parts.length - 1]
    if (!last) return undefined
    const decoded = decodeURIComponent(last)
    const normalized = decoded.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
    return normalized.length > 0 ? normalized : undefined
  } catch {
    return undefined
  }
}

backfillOpenings().catch((error) => {
  console.error('Backfill failed:', error)
  process.exitCode = 1
})
