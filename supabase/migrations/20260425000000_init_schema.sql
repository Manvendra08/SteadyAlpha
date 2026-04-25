CREATE TABLE run_registry (
  run_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type     TEXT NOT NULL,       -- scheduled | manual | webhook
  scheduled_ts     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           TEXT NOT NULL,       -- running | success | failed | partial
  code_version     TEXT NOT NULL,       -- git SHA
  config_snapshot  JSONB NOT NULL,      -- serialized config at run time
  error_summary    TEXT
);

CREATE TABLE pipeline_health (
  pipeline_id    TEXT PRIMARY KEY,
  last_run_id    UUID REFERENCES run_registry(run_id),
  health_status  TEXT NOT NULL,       -- healthy | degraded | failing
  last_success_at TIMESTAMPTZ
);
