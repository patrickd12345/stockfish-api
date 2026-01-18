#!/usr/bin/env tsx

// Load environment variables
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function testDatabase() {
  try {
    console.log('🔍 Testing database connection...')
    
    await connectToDb()
    const sql = getSql()
    
    // Test basic connection
    console.log('✅ Database connection successful')
    
    // Check if progression_summaries table exists
    try {
      const result = await sql`
        SELECT COUNT(*) as count FROM progression_summaries
      `
      console.log('✅ progression_summaries table exists')
      console.log(`📊 Current summaries count: ${result[0].count}`)
    } catch (error) {
      console.log('❌ progression_summaries table does not exist or has issues:', error.message)
      
      // Try to create the table
      console.log('🔧 Attempting to create progression_summaries table...')
      await sql`
        CREATE TABLE IF NOT EXISTS progression_summaries (
          id TEXT PRIMARY KEY DEFAULT 'default',
          summary_data JSONB NOT NULL,
          computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          game_count_used INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      
      await sql`
        CREATE INDEX IF NOT EXISTS idx_progression_summaries_computed_at ON progression_summaries (computed_at DESC)
      `
      
      console.log('✅ progression_summaries table created')
    }
    
    // Test games table
    try {
      const gamesResult = await sql`
        SELECT COUNT(*) as count FROM games
      `
      console.log('✅ games table exists')
      console.log(`🎮 Current games count: ${gamesResult[0].count}`)
    } catch (error) {
      console.log('❌ games table issue:', error.message)
    }
    
  } catch (error) {
    console.error('❌ Database test failed:', error)
  }
}

testDatabase()