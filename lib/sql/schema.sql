-- Games table for chess analysis (Postgres)
-- Run this in your Postgres database (Neon, Vercel Postgres, or any Postgres provider).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date TEXT,
  time TEXT,
  white TEXT,
  black TEXT,
  white_elo INT,
  black_elo INT,
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
);

CREATE INDEX IF NOT EXISTS idx_analysis_blunders_game_id ON analysis_blunders (game_id);
CREATE INDEX IF NOT EXISTS idx_analysis_blunders_created_at ON analysis_blunders (created_at DESC);

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

-- Lichess OAuth tokens for board integration
CREATE TABLE IF NOT EXISTS lichess_oauth_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lichess_user_id TEXT NOT NULL UNIQUE,
  access_token_encrypted TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'Bearer',
  scope TEXT[] NOT NULL DEFAULT '{}',
  expires_in INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_lichess_oauth_tokens_user ON lichess_oauth_tokens (lichess_user_id);

-- Board session lifecycle tracking
CREATE TABLE IF NOT EXISTS lichess_board_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lichess_user_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'idle',
  active_game_id TEXT,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lichess_board_sessions_user ON lichess_board_sessions (lichess_user_id);

-- Latest game state per live game
CREATE TABLE IF NOT EXISTS lichess_game_states (
  game_id TEXT PRIMARY KEY,
  lichess_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'started',
  moves TEXT NOT NULL DEFAULT '',
  fen TEXT NOT NULL,
  wtime INT NOT NULL DEFAULT 0,
  btime INT NOT NULL DEFAULT 0,
  winc INT NOT NULL DEFAULT 0,
  binc INT NOT NULL DEFAULT 0,
  winner TEXT,
  last_move_at TIMESTAMPTZ,
  last_clock_update_at TIMESTAMPTZ,
  my_color TEXT CHECK (my_color IN ('white', 'black')),
  opponent_name TEXT,
  opponent_rating INT,
  initial_time_ms INT,
  initial_increment_ms INT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lichess_game_states_user ON lichess_game_states (lichess_user_id);

-- Chat messages from live Lichess games
CREATE TABLE IF NOT EXISTS lichess_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id TEXT NOT NULL,
  lichess_user_id TEXT NOT NULL,
  room TEXT NOT NULL,
  username TEXT NOT NULL,
  text TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lichess_chat_messages_game ON lichess_chat_messages (game_id, received_at);
