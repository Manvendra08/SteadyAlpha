# SteadyAlpha — Roadmap

## Milestone 1: Trusted Console & Simulation
Goal: Build a reliable operator console and prove value through simulation.

### Phase 0: Foundation and Operating Model
**Objective:** Create the minimum system skeleton with run tracking, deployment, and failure visibility.
- Repository structure aligned to engine boundaries [REQ-001]
- Environment setup for GitHub Actions, Supabase, and Vercel [REQ-002]
- `run_registry` table for run lifecycle and idempotency [REQ-003]
- `pipeline_health` table and health UI banner [REQ-004]
- Base frontend shell [REQ-005]
- Config files for universe, thresholds, and environment-specific settings [REQ-006]

### Phase 1: Data Reliability Layer
**Objective:** Make source data trustworthy enough for downstream logic.
- Source hierarchy for each dataset [REQ-010]
- Data validation rules (freshness, nulls, sanity) [REQ-011]
- `engine_audit` table for diagnostics [REQ-012]
- Historical raw snapshot persistence [REQ-013]

### Phase 2: Core Signal Engines (Regime, Flows, Leadership)
**Objective:** Build and validate the core analytical engines.
- Regime engine with hysteresis [REQ-020]
- Flows engine (Institutional, PCR, Sector) [REQ-021]
- Leadership engine (RS slope, Z-score normalization) [REQ-022]
- `signals_summary` aggregated snapshot table [REQ-023]

### Phase 3: Risk, Advisor & Full UI
**Objective:** Add risk controls and advisor synthesis; complete the console.
- Risk engine (ATR-based sizing, circuit breakers) [REQ-030]
- AI Advisor shell (weighted voting, reasoning) [REQ-031]
- Full six-card UI dashboard [REQ-032]

### Phase 4: Replay & Workflow
**Objective:** Turn the console into a daily operator tool.
- Deterministic replay engine [REQ-040]
- Historical day reconstruction in UI [REQ-041]
- Watchlist and Journaling workflow [REQ-042]

---
*Last updated: 2026-04-25*
