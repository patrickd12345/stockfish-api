-- Migration: Add Pro usage counters and user_id to engine_analysis_queue
-- This migration adds:
-- 1. pro_usage_counters table for tracking Pro user compute budget
-- 2. user_id column to engine_analysis_queue for user-scoped job tracking

-- Create pro_usage_counters table
CREATE TABLE IF NOT EXISTS pro_usage_counters (
  user_id TEXT NOT NULL,
  billing_period_start DATE NOT NULL,
  engine_cpu_ms_used BIGINT NOT NULL DEFAULT 0,
  engine_jobs_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, billing_period_start)
);

CREATE INDEX IF NOT EXISTS idx_pro_usage_counters_user_period 
  ON pro_usage_counters (user_id, billing_period_start DESC);

-- Add user_id to engine_analysis_queue
ALTER TABLE engine_analysis_queue 
  ADD COLUMN IF NOT EXISTS user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_engine_analysis_queue_user 
  ON engine_analysis_queue (user_id);
