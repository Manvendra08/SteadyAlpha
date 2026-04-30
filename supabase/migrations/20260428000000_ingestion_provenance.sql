-- Ingestion provenance schema for SteadyAlpha v0.7.0
-- Stores audit trail of every dataset fetch attempt

CREATE TABLE IF NOT EXISTS run_provenance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    dataset_key TEXT NOT NULL,
    provider TEXT NOT NULL,
    source_type TEXT NOT NULL,       -- REAL | FALLBACK | SCRAPED | CACHED | MISSING
    freshness TEXT NOT NULL,         -- FRESH | STALE | MISSING
    criticality TEXT NOT NULL,       -- CRITICAL_FOR_DECISION | CRITICAL_FOR_RISK | etc
    trading_valid BOOLEAN NOT NULL,
    record_count INTEGER,
    error TEXT,
    warning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_run_provenance_run_id ON run_provenance(run_id);
CREATE INDEX idx_run_provenance_dataset ON run_provenance(dataset_key);

COMMENT ON TABLE run_provenance IS 'Audit trail for data ingestion sources and validity per run.';
