-- Games table for chess analysis (Postgres)
-- Run this in your Postgres database (Neon, Vercel Postgres, or any Postgres provider).

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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_games_created_at ON games (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_games_dedup ON games (date, white, black);
