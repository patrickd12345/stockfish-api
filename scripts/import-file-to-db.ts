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
    const batch = games.slice(i, i + BATCH_SIZE)

    await Promise.all(
      batch.map(async (rawGame: any) => {
        const pgn = rawGame?.pgn
        if (!pgn) {
          return
        }

        try {
          const chess = new Chess()
          const loaded = chess.loadPgn(pgn)
          if (!loaded) {
            console.warn('Skipping game with invalid PGN.')
            return
          }
          const headers = chess.header()

          const date = resolveGameDate(headers, rawGame)
          const white = headers.White || 'Unknown'
          const black = headers.Black || 'Unknown'
          const result = headers.Result || '*'
          const opening = headers.Opening || ''

          const existing = await sql`
            SELECT id FROM games
            WHERE date = ${date} AND white = ${white} AND black = ${black}
            LIMIT 1
          `

          if (existing.length > 0) {
            skipped++
            return
          }

          await sql`
            INSERT INTO games (
              date, white, black, result, opening_name,
              pgn_text, blunders, my_accuracy
            ) VALUES (
              ${date}, ${white}, ${black}, ${result}, ${opening},
              ${pgn}, 0, null
            )
          `

          imported++
        } catch (err) {
          console.error('Failed to import game:', err)
        }
      })
    )

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
