-- Migration: Create users table
-- Phase 0 Auth: Simple users table for DEV-only authentication bootstrap
-- This table can be extended with auth fields (email, password_hash, etc.) when real auth is implemented

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at);
