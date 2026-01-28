#!/usr/bin/env tsx

/**
 * Migration: Enable pg_trgm and add GIN indexes for search optimization.
 *
 * Usage:
 *   npx tsx scripts/migrate-search-optimization.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function migrate() {
  console.log('🔄 Running search optimization migration...')

  try {
    await connectToDb()
    const sql = getSql()

    // Enable pg_trgm extension
    console.log('   Enabling pg_trgm extension...')
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`

    // Create indexes
    console.log('   Creating GIN indexes...')

    // white
    await sql`CREATE INDEX IF NOT EXISTS idx_games_white_trgm ON games USING GIN (white gin_trgm_ops)`

    // black
    await sql`CREATE INDEX IF NOT EXISTS idx_games_black_trgm ON games USING GIN (black gin_trgm_ops)`

    // opening_name
    await sql`CREATE INDEX IF NOT EXISTS idx_games_opening_name_trgm ON games USING GIN (opening_name gin_trgm_ops)`

    // date (cast to text for ILIKE searches)
    await sql`CREATE INDEX IF NOT EXISTS idx_games_date_trgm ON games USING GIN ((date::text) gin_trgm_ops)`

    console.log('✅ Migration completed: Search indexes created.')
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migrate()
