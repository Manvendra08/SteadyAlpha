# SteadyAlpha — Requirements

## Foundation (Phase 0)
- **REQ-001:** Repository structure must follow the engine boundaries defined in the roadmap.
- **REQ-002:** GitHub Actions, Supabase, and Vercel must be configured with correct secrets and deployment paths.
- **REQ-003:** `run_registry` table must track `trigger_type`, `status`, `code_version`, and `config_snapshot`.
- **REQ-004:** Pipeline health must be visible via a UI banner driven by a `pipeline_health` table.
- **REQ-005:** Base frontend shell must load and display basic run status.
- **REQ-006:** Configuration must be centralized in `/config` directory (YAML/JSON).

## Data Reliability (Phase 1)
- **REQ-010:** Data sources must have a documented hierarchy and fallback logic.
- **REQ-011:** Validation rules must classify data as `fresh`, `stale`, `degraded`, or `missing`.
- **REQ-012:** `engine_audit` must store `input_digest`, `output_digest`, and `warnings` for every engine run.
- **REQ-013:** Raw input snapshots must be persisted to enable deterministic replay.

## Signal Engines (Phase 2)
- **REQ-020:** Regime engine must confirm state changes only after 2 consecutive days of confirmation.
- **REQ-021:** Flows engine must incorporate FII/DII net, PCR percentile, and Sector RS.
- **REQ-022:** Leadership engine must use Z-score normalized RS slope (20d) for ranking F&O 200 universe.
- **REQ-023:** `signals_summary` must provide a single-row snapshot for frontend subscription.

## Risk & Advisor (Phase 3)
- **REQ-030:** Risk engine must include ATR-based sizing and circuit breakers (1.5% intraday / 6% peak drawdown).
- **REQ-031:** AI Advisor must synthesize engine outputs into Action recommendations (LONG, SHORT, NO_TRADE).
- **REQ-032:** UI must include cards for Regime, Flows, Leadership, Risk, Advisor, and Health.

## Replay & Human Workflow (Phase 4)
- **REQ-040:** Replay must be deterministic by loading stored config snapshots and data.
- **REQ-041:** UI must allow selecting historical dates to reconstruct signal states.
- **REQ-042:** Users must be able to tag symbols as `watch`, `stalking`, or `ignored` within the app.

---
*Last updated: 2026-04-25*
