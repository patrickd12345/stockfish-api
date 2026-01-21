#!/usr/bin/env tsx

/**
 * Backfill games.white_elo / games.black_elo from PGN tags.
 *
 * Usage:
 *   npx tsx scripts/backfill-game-ratings.ts
 *
 * Notes:
 * - This parses tags directly (fast), no chess.js load needed.
 * - Safe to re-run; it only updates rows where either elo column is NULL.
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

function extractTag(pgn: string, tag: string): string | null {
  // Matches: [Tag "Value"]
  const re = new RegExp(`\\[${tag}\\s+"([^"]*)"\\]`, 'i')
  const m = pgn.match(re)
  return m ? m[1] : null
}

function parseElo(raw: string | null): number | null {
  if (!raw) return null
  const n = Number(String(raw).replace(/[^\d]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return Math.trunc(n)
}

async function backfill() {
  await connectToDb()
  const sql = getSql()

  const batchSize = 500
  let totalUpdated = 0
  let scanned = 0

  console.log('🔄 Backfilling game ratings from PGN...')

  while (true) {
    const rows = (await sql`
      SELECT id, pgn_text
      FROM games
      WHERE (white_elo IS NULL OR black_elo IS NULL)
      ORDER BY created_at DESC
      LIMIT ${batchSize}
    `) as Array<{ id: string; pgn_text: string }>

    if (rows.length === 0) break
    scanned += rows.length

    for (const row of rows) {
      const pgn = String(row.pgn_text || '')
      const whiteElo = parseElo(extractTag(pgn, 'WhiteElo'))
      const blackElo = parseElo(extractTag(pgn, 'BlackElo'))

      if (whiteElo === null && blackElo === null) continue

      await sql`
        UPDATE games
        SET
          white_elo = COALESCE(white_elo, ${whiteElo}),
          black_elo = COALESCE(black_elo, ${blackElo})
        WHERE id = ${row.id}
      `
      totalUpdated++
    }

    console.log(`… scanned ${scanned.toLocaleString()} rows, updated ${totalUpdated.toLocaleString()}`)

    // Safety: avoid runaway loops in weird DB states
    if (scanned > 2_000_000) {
      console.warn('Stopping after scanning 2,000,000 rows for safety.')
      break
    }
  }

  console.log(`✅ Backfill complete. Updated ${totalUpdated.toLocaleString()} games.`)
}

backfill().catch((e) => {
  console.error('❌ Backfill failed:', e)
  process.exit(1)
})

