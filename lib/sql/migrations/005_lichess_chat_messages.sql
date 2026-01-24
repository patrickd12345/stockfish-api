-- Migration: Create lichess_chat_messages table
-- Stores chat messages from live Lichess games

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
