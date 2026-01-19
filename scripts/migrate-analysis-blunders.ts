#!/usr/bin/env tsx

import { connectToDb, getSql } from '../lib/database'

async function migrateAnalysisBlunders() {
  console.log('Running analysis_blunders table migration...')
  await connectToDb()
  const sql = getSql()

  await sql`
    CREATE TABLE IF NOT EXISTS analysis_blunders (
      id BIGSERIAL PRIMARY KEY,
      game_id UUID NOT NULL,
      engine_name TEXT NOT NULL,
      analysis_depth INT NOT NULL DEFAULT 15,
      move_number INT NOT NULL,
      ply INT NOT NULL,
      fen TEXT NOT NULL,
      played_move TEXT NOT NULL,
      best_move TEXT,
      eval_before INT NOT NULL,
      eval_after INT NOT NULL,
      best_eval INT,
      centipawn_loss INT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_analysis_blunders_game_id ON analysis_blunders (game_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_analysis_blunders_created_at ON analysis_blunders (created_at DESC)`

  console.log('analysis_blunders table ready.')
}

migrateAnalysisBlunders().catch((error) => {
  console.error('analysis_blunders migration failed:', error)
  process.exit(1)
})
