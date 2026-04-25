-- SteadyAlpha Signal Schema
-- Replaces flat schema with JSONB + History tables per Spec Section 6

-- 1. Runs Registry
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL CHECK (status IN ('success', 'partial', 'failed')),
    duration_ms INTEGER,
    errors JSONB DEFAULT '[]',
    meta JSONB DEFAULT '{}'
);

-- 2. Signals Summary (Current State)
-- Stores the full JSONB output of each engine for the latest run
CREATE TABLE IF NOT EXISTS signals_summary (
    run_id UUID PRIMARY KEY REFERENCES runs(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL,
    regime JSONB NOT NULL,
    flows JSONB NOT NULL,
    leadership JSONB NOT NULL,
    risk JSONB NOT NULL,
    advisor JSONB NOT NULL,
    meta JSONB DEFAULT '{}'
);

-- 3. Regime History (Audit & Replay)
CREATE TABLE IF NOT EXISTS regime_history (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    run_id UUID REFERENCES runs(id),
    state TEXT NOT NULL,
    trend_score FLOAT,
    vix_value FLOAT,
    breadth_pct FLOAT,
    transition_reason TEXT,
    raw_inputs JSONB
);

-- 4. Flows History
CREATE TABLE IF NOT EXISTS flows_history (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    run_id UUID REFERENCES runs(id),
    flows_score FLOAT,
    fii_5d_z FLOAT,
    pcr_smooth FLOAT,
    rs_spread_pct FLOAT,
    components JSONB
);

-- 5. Leadership History
CREATE TABLE IF NOT EXISTS leadership_history (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    run_id UUID REFERENCES runs(id),
    universe_size INTEGER,
    leaders_count INTEGER,
    avg_score FLOAT,
    top_sectors JSONB,
    blackout_count INTEGER,
    details JSONB
);

-- 6. Risk History
CREATE TABLE IF NOT EXISTS risk_history (
    id BIGSERIAL PRIMARY KEY,
    timestamp TIMESTAMPTZ NOT NULL,
    run_id UUID REFERENCES runs(id),
    portfolio_risk_pct FLOAT,
    max_position_risk_pct FLOAT,
    circuit_breaker_active BOOLEAN DEFAULT FALSE,
    reason TEXT,
    limits JSONB
);

-- 7. Signal Alerts
CREATE TABLE IF NOT EXISTS signal_alerts (
    id BIGSERIAL PRIMARY KEY,
    run_id UUID REFERENCES runs(id),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
    alert_type TEXT NOT NULL,
    severity TEXT CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT,
    context JSONB
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_regime_history_ts ON regime_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_flows_history_ts ON flows_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_leadership_history_ts ON leadership_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_risk_history_ts ON risk_history(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_run ON signal_alerts(run_id);

-- Comments for Documentation
COMMENT ON TABLE signals_summary IS 'Latest consolidated signal state. Engines write JSONB blobs here.';
COMMENT ON TABLE regime_history IS 'Time-series of regime states for replay and backtesting.';
