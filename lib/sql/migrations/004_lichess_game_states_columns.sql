-- Migration: Add missing columns to lichess_game_states table
-- Adds columns for tracking player color, opponent info, and initial clock settings

ALTER TABLE lichess_game_states
  ADD COLUMN IF NOT EXISTS my_color TEXT CHECK (my_color IN ('white', 'black')),
  ADD COLUMN IF NOT EXISTS opponent_name TEXT,
  ADD COLUMN IF NOT EXISTS opponent_rating INT,
  ADD COLUMN IF NOT EXISTS initial_time_ms INT,
  ADD COLUMN IF NOT EXISTS initial_increment_ms INT;
