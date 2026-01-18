#!/usr/bin/env tsx

/**
 * Database migration script for engine_analysis table
 * 
 * This script creates the engine_analysis table if it doesn't exist.
 * Run this once before using the engine analysis pipeline.
 * 
 * Usage:
 *   npx tsx scripts/migrate-engine-analysis.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import * as fs from 'fs'

dotenv.config({ path: path.join(__dirname, '..', '.env.local') })

import { connectToDb, getSql } from '../lib/database'

async function migrate() {
  console.log('🔄 Running engine_analysis table migration...')
  
  try {
    await connectToDb()
    const sql = getSql()
    
    // Execute engine_analysis table creation directly
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS engine_analysis (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        engine_name TEXT NOT NULL DEFAULT 'stockfish',
        engine_version TEXT,
        analysis_depth INT NOT NULL DEFAULT 15,
        analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        
        -- Phase 1 metrics
        avg_centipawn_loss FLOAT,
        blunders INT DEFAULT 0,
        mistakes INT DEFAULT 0,
        inaccuracies INT DEFAULT 0,
        eval_swing_max FLOAT,
        opening_cpl FLOAT,
        middlegame_cpl FLOAT,
        endgame_cpl FLOAT,
        game_length INT,
        
        -- Phase 2 extension support
        has_full_analysis BOOLEAN DEFAULT false,
        analysis_notes_version TEXT,
        
        -- Phase 2 data (stored as JSONB for flexibility)
        critical_moments JSONB,
        missed_tactics JSONB,
        time_trouble_indicators JSONB,
        pv_snapshots JSONB,
        
        -- Failure handling
        analysis_failed BOOLEAN DEFAULT false,
        failure_reason TEXT,
        
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        
        -- One analysis per game per engine version
        UNIQUE(game_id, engine_name, engine_version, analysis_depth)
      );
    `
    
    const createIndexesSQL = [
      `CREATE INDEX IF NOT EXISTS idx_engine_analysis_game_id ON engine_analysis (game_id);`,
      `CREATE INDEX IF NOT EXISTS idx_engine_analysis_analyzed_at ON engine_analysis (analyzed_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_engine_analysis_failed ON engine_analysis (analysis_failed) WHERE analysis_failed = false;`
    ]
    
    console.log('📝 Creating engine_analysis table...')
    try {
      // Execute the CREATE TABLE statement
      await sql`
        CREATE TABLE IF NOT EXISTS engine_analysis (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
          engine_name TEXT NOT NULL DEFAULT 'stockfish',
          engine_version TEXT,
          analysis_depth INT NOT NULL DEFAULT 15,
          analyzed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          avg_centipawn_loss FLOAT,
          blunders INT DEFAULT 0,
          mistakes INT DEFAULT 0,
          inaccuracies INT DEFAULT 0,
          eval_swing_max FLOAT,
          opening_cpl FLOAT,
          middlegame_cpl FLOAT,
          endgame_cpl FLOAT,
          game_length INT,
          has_full_analysis BOOLEAN DEFAULT false,
          analysis_notes_version TEXT,
          critical_moments JSONB,
          missed_tactics JSONB,
          time_trouble_indicators JSONB,
          pv_snapshots JSONB,
          analysis_failed BOOLEAN DEFAULT false,
          failure_reason TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE(game_id, engine_name, engine_version, analysis_depth)
        )
      `
      console.log('   ✅ Table created')
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.code === '42P07') {
        console.log('   ⚠️  Table already exists, skipping...')
      } else {
        throw error
      }
    }
    
    console.log('📝 Creating indexes...')
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_engine_analysis_game_id ON engine_analysis (game_id)`
      await sql`CREATE INDEX IF NOT EXISTS idx_engine_analysis_analyzed_at ON engine_analysis (analyzed_at DESC)`
      await sql`CREATE INDEX IF NOT EXISTS idx_engine_analysis_failed ON engine_analysis (analysis_failed) WHERE analysis_failed = false`
      console.log('   ✅ Indexes created')
    } catch (error: any) {
      console.warn(`   ⚠️  Index creation warning: ${error.message}`)
    }
    
    console.log('📝 Creating engine_summaries table...')
    try {
      await sql`
        CREATE TABLE IF NOT EXISTS engine_summaries (
          id TEXT PRIMARY KEY DEFAULT 'default',
          summary_data JSONB NOT NULL,
          computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          game_count_used INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS idx_engine_summaries_computed_at ON engine_summaries (computed_at DESC)`
      console.log('   ✅ engine_summaries table created')
    } catch (error: any) {
      if (error.message?.includes('already exists') || error.code === '42P07') {
        console.log('   ⚠️  Table already exists, skipping...')
      } else {
        console.warn(`   ⚠️  Table creation warning: ${error.message}`)
      }
    }
    
    console.log('✅ Migration completed successfully!')
    
    // Verify the table exists
    const tableCheck = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'engine_analysis'
      )
    `
    
    if (tableCheck[0]?.exists) {
      console.log('✅ engine_analysis table verified')
    } else {
      console.error('❌ engine_analysis table not found after migration')
      process.exit(1)
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error)
    process.exit(1)
  }
}

migrate()
