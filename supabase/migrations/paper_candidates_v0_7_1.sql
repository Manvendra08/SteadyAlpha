-- Paper Trade Generation Tuning Spec v0.7.1
-- Migration: Create paper_candidates table for candidate persistence

CREATE TABLE IF NOT EXISTS paper_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL,
  candidate_score FLOAT,
  promotion_score FLOAT,
  leadership_score FLOAT,
  regime_alignment FLOAT,
  flow_modifier FLOAT,
  volume_confirmation FLOAT,
  execution_context FLOAT,
  promotion_eligible BOOLEAN DEFAULT FALSE,
  strong_promotion_eligible BOOLEAN DEFAULT FALSE,
  candidate_status TEXT NOT NULL,
  block_reason TEXT,
  components JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_paper_candidates_run_id ON paper_candidates(run_id);
CREATE INDEX idx_paper_candidates_symbol ON paper_candidates(symbol);
CREATE INDEX idx_paper_candidates_timestamp ON paper_candidates(timestamp DESC);
CREATE INDEX idx_paper_candidates_promotion ON paper_candidates(promotion_eligible);
