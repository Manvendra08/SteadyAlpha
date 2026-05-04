-- Paper Trade Generation Tuning Spec v0.7.1
-- Migration: Extend run_registry table with paper generation state and candidate counts

-- Add columns to run_registry if not present
-- These capture paper generation metadata (Section 11)

ALTER TABLE runs
ADD COLUMN IF NOT EXISTS candidate_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS promotion_qualified_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS strong_promotion_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS top_candidate_symbol TEXT,
ADD COLUMN IF NOT EXISTS top_candidate_score FLOAT,
ADD COLUMN IF NOT EXISTS paper_generation_state TEXT,
ADD COLUMN IF NOT EXISTS promotion_block_reason TEXT;

-- Indexes for state-based queries
CREATE INDEX IF NOT EXISTS idx_runs_paper_generation_state ON runs(paper_generation_state);
CREATE INDEX IF NOT EXISTS idx_runs_promotion_qualified ON runs(promotion_qualified_count);
