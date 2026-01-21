#!/usr/bin/env tsx

/**
 * Migration: add Elo columns to games table.
 *
 * Usage:
 *   npx tsx scripts/migrate-game-ratings.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function migrate() {
  console.log('🔄 Running games rating columns migration...')

  try {
    await connectToDb()
    const sql = getSql()

    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS white_elo INT`
    await sql`ALTER TABLE games ADD COLUMN IF NOT EXISTS black_elo INT`

    await sql`CREATE INDEX IF NOT EXISTS idx_games_white_elo ON games (white_elo)`
    await sql`CREATE INDEX IF NOT EXISTS idx_games_black_elo ON games (black_elo)`

    console.log('✅ Migration completed: added white_elo / black_elo')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migrate()

