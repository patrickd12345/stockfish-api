#!/usr/bin/env tsx

/**
 * BULK IMPORT SCRIPT
 *
 * Usage:
 *   npx tsx scripts/import-file-to-db.ts downloads/chesscom/username.json
 */

// Load environment variables BEFORE importing any modules that use them
import * as dotenv from 'dotenv'
import * as path from 'path'

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

import fs from 'node:fs/promises'
import { Chess } from 'chess.js'
import { getSql } from '../lib/database'

const BATCH_SIZE = 50

function resolveGameDate(headers: Record<string, string>, rawGame: any): string {
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

async function main() {
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

  let imported = 0
  let skipped = 0

  for (let i = 0; i < games.length; i += BATCH_SIZE) {
    const rawBatch = games.slice(i, i + BATCH_SIZE)
    const parsedGames: any[] = []

    // 1. Parse Phase
    for (const rawGame of rawBatch) {
      const pgn = rawGame?.pgn
      if (!pgn) continue

      try {
        const chess = new Chess()
        const loaded = chess.loadPgn(pgn)
        if (!loaded) {
          console.warn('Skipping game with invalid PGN.')
          continue
        }
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
          my_accuracy: null
        })
      } catch (err) {
        console.error('Error parsing game:', err)
      }
    }

    if (parsedGames.length === 0) continue

    try {
      // 2. Bulk Check Phase
      // We check for any games that match the dates involved, then filter more strictly in memory.
      const dates = parsedGames.map(g => g.date)
      const existingCandidates = await sql`
        SELECT date, white, black FROM games
        WHERE date = ANY(${dates}::text[])
      `

      const existingSet = new Set(
        existingCandidates.map((r: any) => `${r.date}|${r.white}|${r.black}`)
      )

      const toInsert = parsedGames.filter(g => !existingSet.has(`${g.date}|${g.white}|${g.black}`))
      skipped += (parsedGames.length - toInsert.length)

      if (toInsert.length > 0) {
        // 3. Bulk Insert Phase
        // Use UNNEST pattern for efficient bulk insert
        await sql`
          INSERT INTO games (
            date, white, black, result, opening_name,
            pgn_text, blunders, my_accuracy
          )
          SELECT * FROM UNNEST(
            ${toInsert.map(g => g.date)}::text[],
            ${toInsert.map(g => g.white)}::text[],
            ${toInsert.map(g => g.black)}::text[],
            ${toInsert.map(g => g.result)}::text[],
            ${toInsert.map(g => g.opening)}::text[],
            ${toInsert.map(g => g.pgn)}::text[],
            ${toInsert.map(g => g.blunders)}::int[],
            ${toInsert.map(g => g.my_accuracy)}::int[]
          )
        `
        imported += toInsert.length
      }

    } catch (batchError) {
      console.error('Batch insert failed. Retrying row-by-row...', batchError)

      // Fallback: Row-by-row insertion
      for (const game of parsedGames) {
        try {
           const existing = await sql`
            SELECT id FROM games
            WHERE date = ${game.date} AND white = ${game.white} AND black = ${game.black}
            LIMIT 1
          `
          if (existing.length > 0) {
            skipped++
            continue
          }

          await sql`
            INSERT INTO games (
              date, white, black, result, opening_name,
              pgn_text, blunders, my_accuracy
            ) VALUES (
              ${game.date}, ${game.white}, ${game.black}, ${game.result}, ${game.opening},
              ${game.pgn}, 0, null
            )
          `
          imported++
        } catch (rowError) {
          console.error('Failed to import game (fallback):', rowError)
        }
      }
    }

    console.log(`Processed ${Math.min(i + BATCH_SIZE, games.length)}/${games.length}...`)
  }

  console.log('\nImport complete!')
  console.log(`✅ Imported: ${imported}`)
  console.log(`⏭️  Skipped (Duplicates): ${skipped}`)
}

main().catch((error) => {
  console.error('❌ Import failed:', error)
  process.exit(1)
})
