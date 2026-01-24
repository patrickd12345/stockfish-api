-- Migration: Blunder DNA tables
-- Creates tables for Blunder DNA pattern analysis, drills, attempts, mastery tracking, and daily queue

CREATE TABLE IF NOT EXISTS blunder_dna_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lichess_user_id TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT 'v1',
  pattern_tag TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  occurrences INT NOT NULL DEFAULT 0,
  weakness_score FLOAT NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lichess_user_id, version, pattern_tag)
);

CREATE TABLE IF NOT EXISTS blunder_dna_drills (
  drill_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lichess_user_id TEXT NOT NULL,
  lichess_game_id TEXT NOT NULL,
  ply INT NOT NULL,
  fen TEXT NOT NULL,
  side_to_move TEXT NOT NULL,
  my_move TEXT NOT NULL,
  best_move TEXT NOT NULL,
  pv TEXT NOT NULL,
  eval_before INT NOT NULL,
  eval_after INT NOT NULL,
  pattern_tag TEXT NOT NULL,
  difficulty INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (lichess_user_id, lichess_game_id, ply, pattern_tag)
);

CREATE TABLE IF NOT EXISTS blunder_dna_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id UUID NOT NULL REFERENCES blunder_dna_drills(drill_id) ON DELETE CASCADE,
  lichess_user_id TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_move TEXT,
  ok BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS blunder_dna_mastery (
  drill_id UUID PRIMARY KEY REFERENCES blunder_dna_drills(drill_id) ON DELETE CASCADE,
  lichess_user_id TEXT NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  correct INT NOT NULL DEFAULT 0,
  streak INT NOT NULL DEFAULT 0,
  ease FLOAT NOT NULL DEFAULT 2.5,
  interval_days INT NOT NULL DEFAULT 0,
  due_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS blunder_dna_daily_queue (
  lichess_user_id TEXT NOT NULL,
  date DATE NOT NULL,
  drill_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (lichess_user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_blunder_dna_drills_user_tag ON blunder_dna_drills (lichess_user_id, pattern_tag);
CREATE INDEX IF NOT EXISTS idx_blunder_dna_attempts_user_time ON blunder_dna_attempts (lichess_user_id, attempted_at DESC);
CREATE INDEX IF NOT EXISTS idx_blunder_dna_patterns_user_score ON blunder_dna_patterns (lichess_user_id, weakness_score DESC);
