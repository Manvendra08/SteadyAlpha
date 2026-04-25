-- Signal and audit schema for SteadyAlpha engines
-- Depends on: 20260425000000_init_schema.sql (run_registry)

CREATE TABLE engine_audit (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id        UUID NOT NULL REFERENCES run_registry(run_id),
  engine_name   TEXT NOT NULL,         -- regime | flows | leadership
  input_digest  TEXT NOT NULL,         -- SHA-256 prefix of inputs
  output_digest TEXT NOT NULL,         -- SHA-256 prefix of outputs
  diagnostics   JSONB,                 -- engine-specific debug info
  executed_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE signals_summary (
  run_id          UUID PRIMARY KEY REFERENCES run_registry(run_id),
  regime_state    TEXT NOT NULL,
  regime_score    REAL,
  regime_changed  BOOLEAN DEFAULT FALSE,
  flows_bias      TEXT NOT NULL,
  fii_net         REAL,
  dii_net         REAL,
  pcr_value       REAL,
  pcr_percentile  REAL,
  top_leaders     JSONB,               -- [{symbol, z_score, rank}]
  top_laggards    JSONB,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_scores (
  run_id    UUID NOT NULL REFERENCES run_registry(run_id),
  symbol    TEXT NOT NULL,
  rs_slope  REAL NOT NULL,
  z_score   REAL NOT NULL,
  rank      INTEGER NOT NULL,
  PRIMARY KEY (run_id, symbol)
);
