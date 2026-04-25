-- Paper execution schema for SteadyAlpha phase 3
-- Depends on: 20260425000000_init_schema.sql (run_registry)

CREATE TABLE paper_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id                UUID NOT NULL REFERENCES run_registry(run_id),
  source_signal_key     TEXT NOT NULL,
  source_engine         TEXT NOT NULL DEFAULT 'advisor',
  symbol                TEXT NOT NULL,
  direction             TEXT NOT NULL,       -- LONG | SHORT
  requested_qty         INTEGER NOT NULL,
  confidence_at_entry   REAL NOT NULL,
  risk_pct              REAL NOT NULL,
  sizing_basis          JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL,       -- pending | rejected | filled | cancelled
  rejection_reason      TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (run_id, source_signal_key, symbol, direction)
);

CREATE INDEX idx_paper_orders_run_id ON paper_orders(run_id);
CREATE INDEX idx_paper_orders_status ON paper_orders(status);

CREATE TABLE paper_trades (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_order_id        UUID NOT NULL REFERENCES paper_orders(id),
  run_id                UUID NOT NULL REFERENCES run_registry(run_id),
  symbol                TEXT NOT NULL,
  direction             TEXT NOT NULL,       -- LONG | SHORT
  qty                   INTEGER NOT NULL,
  status                TEXT NOT NULL,       -- open | closed
  entry_price           REAL,
  slippage_bps          REAL,
  entry_at              TIMESTAMPTZ,
  exit_price            REAL,
  exit_at               TIMESTAMPTZ,
  pnl                   REAL,
  exit_reason           TEXT,
  simulation_version    TEXT NOT NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (paper_order_id)
);

CREATE INDEX idx_paper_trades_run_id ON paper_trades(run_id);
CREATE INDEX idx_paper_trades_status ON paper_trades(status);

