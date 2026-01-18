-- Games table for chess analysis (Postgres)
-- Run this in your Postgres database (Neon, Vercel Postgres, or any Postgres provider).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT,
  white TEXT,
  black TEXT,
  result TEXT,
  opening_name TEXT,
  my_accuracy FLOAT,
  blunders INT NOT NULL DEFAULT 0,
  pgn_text TEXT NOT NULL,
  moves JSONB,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE games
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_dedup ON games (date, white, black);
CREATE INDEX IF NOT EXISTS idx_games_embedding ON games USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Progression summaries table for batch analysis results
CREATE TABLE IF NOT EXISTS progression_summaries (
  id TEXT PRIMARY KEY DEFAULT 'default',
  summary_data JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game_count_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_progression_summaries_computed_at ON progression_summaries (computed_at DESC);

-- Engine analysis table for offline Stockfish analysis results
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
  
  -- One analysis per game per engine version
  UNIQUE(game_id, engine_name, engine_version, analysis_depth),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engine_analysis_game_id ON engine_analysis (game_id);
CREATE INDEX IF NOT EXISTS idx_engine_analysis_analyzed_at ON engine_analysis (analyzed_at DESC);
CREATE INDEX IF NOT EXISTS idx_engine_analysis_failed ON engine_analysis (analysis_failed) WHERE analysis_failed = false;

-- Queue for background engine analysis jobs
CREATE TABLE IF NOT EXISTS engine_analysis_queue (
  id BIGSERIAL PRIMARY KEY,
  game_id UUID NOT NULL,
  engine_name TEXT NOT NULL,
  analysis_depth INT NOT NULL DEFAULT 15,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_id, engine_name, analysis_depth)
);

-- Engine summaries table for batch analysis results
CREATE TABLE IF NOT EXISTS engine_summaries (
  id TEXT PRIMARY KEY DEFAULT 'default',
  summary_data JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  game_count_used INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_engine_summaries_computed_at ON engine_summaries (computed_at DESC);
