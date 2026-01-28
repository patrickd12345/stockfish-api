#!/usr/bin/env tsx

/**
 * BULK IMPORT SCRIPT
 *
 * Usage:
 *   npx tsx scripts/import-file-to-db.ts downloads/chesscom/username.json
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import fs from 'node:fs/promises'
import { Chess } from 'chess.js'
import { getSql } from '../lib/database'

export const BATCH_SIZE = 50

export function resolveGameDate(headers: Record<string, string>, rawGame: any): string {
  const headerDate = typeof headers.Date === 'string' ? headers.Date.trim() : ''
  if (headerDate && headerDate !== '????.??.??') {
    return headerDate
  }

  const endTime = Number(rawGame?.end_time ?? rawGame?.endTime ?? rawGame?.end)
  if (Number.isFinite(endTime) && endTime > 0) {
    return new Date(endTime * 1000).toISOString()
  }

  return new Date().toISOString()
}

export async function processBatch(batch: any[], sql: any): Promise<{ imported: number, skipped: number }> {
  const parsedGames: any[] = []

  // Step 1: Parse all games
  for (const rawGame of batch) {
    const pgn = rawGame?.pgn
    if (!pgn) continue

    try {
      const chess = new Chess()
      chess.loadPgn(pgn)
      const headers = chess.header()

      const date = resolveGameDate(headers, rawGame)
      const white = headers.White || 'Unknown'
      const black = headers.Black || 'Unknown'
      const result = headers.Result || '*'
      const opening = headers.Opening || ''

      parsedGames.push({
        date,
        white,
        black,
        result,
        opening,
        pgn,
        blunders: 0,
        my_accuracy: null,
      })
    } catch (err) {
      console.error('Failed to parse game:', err)
    }
  }

  if (parsedGames.length === 0) {
    return { imported: 0, skipped: 0 }
  }

  // Step 2: Check for existing games
  const dates = parsedGames.map((g) => g.date)
  const whites = parsedGames.map((g) => g.white)
  const blacks = parsedGames.map((g) => g.black)

  const existingRows = await sql`
    SELECT date, white, black FROM games
    JOIN (
        SELECT * FROM UNNEST(${dates}::text[], ${whites}::text[], ${blacks}::text[])
        AS t(date, white, black)
    ) AS input
    ON games.date = input.date
    AND games.white = input.white
    AND games.black = input.black
  `

  const existingSet = new Set(
    existingRows.map((row: any) => JSON.stringify([row.date, row.white, row.black]))
  )

  // Step 3: Filter
  const newGames = parsedGames.filter(
    (g) => !existingSet.has(JSON.stringify([g.date, g.white, g.black]))
  )
  const skipped = parsedGames.length - newGames.length
  let imported = 0

  // Step 4: Insert
  if (newGames.length > 0) {
    const newDates = newGames.map((g) => g.date)
    const newWhites = newGames.map((g) => g.white)
    const newBlacks = newGames.map((g) => g.black)
    const newResults = newGames.map((g) => g.result)
    const newOpenings = newGames.map((g) => g.opening)
    const newPgns = newGames.map((g) => g.pgn)
    const newBlunders = newGames.map((g) => g.blunders)

    await sql`
        INSERT INTO games (
          date, white, black, result, opening_name,
          pgn_text, blunders, my_accuracy
        )
        SELECT
          date, white, black, result, opening, pgn, blunders, NULL
        FROM UNNEST(
            ${newDates}::text[],
            ${newWhites}::text[],
            ${newBlacks}::text[],
            ${newResults}::text[],
            ${newOpenings}::text[],
            ${newPgns}::text[],
            ${newBlunders}::int[]
        ) AS t(date, white, black, result, opening, pgn, blunders)
      `
    imported = newGames.length
  }

  return { imported, skipped }
}

async function main() {
  const envPath = path.join(__dirname, '..', '.env.local')
  const result = dotenv.config({ path: envPath })

  if (result.error) {
    console.error('❌ Failed to load .env.local:', result.error.message)
    process.exit(1)
  }

  const hasDbConnection = !!(
    process.env.POSTGRES_URL?.trim() ||
    process.env.DATABASE_URL?.trim() ||
    process.env.POSTGRES_PRISMA_URL?.trim()
  )

  if (!hasDbConnection) {
    console.error('❌ Database connection string is required')
    console.error('   Please set one of: POSTGRES_URL, DATABASE_URL, or POSTGRES_PRISMA_URL')
    process.exit(1)
  }

  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Please provide a JSON file path')
    process.exit(1)
  }

  const resolvedPath = path.resolve(process.cwd(), filePath)
  const sql = getSql()

  console.log(`Reading games from ${resolvedPath}...`)
  const fileContent = await fs.readFile(resolvedPath, 'utf-8')
  const games = JSON.parse(fileContent)

  if (!Array.isArray(games)) {
    console.error('Expected JSON array of games')
    process.exit(1)
  }

  console.log(`Found ${games.length} games. Starting import...`)

  let totalImported = 0
  let totalSkipped = 0

  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const batch = games.slice(i, i + BATCH_SIZE)
    const { imported, skipped } = await processBatch(batch, sql)

    totalImported += imported
    totalSkipped += skipped

    console.log(`Processed ${Math.min(i + BATCH_SIZE, games.length)}/${games.length}...`)
  }

  console.log('\nImport complete!')
  console.log(`✅ Imported: ${totalImported}`)
  console.log(`⏭️  Skipped (Duplicates): ${totalSkipped}`)
}

if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Import failed:', error)
    process.exit(1)
  })
}
