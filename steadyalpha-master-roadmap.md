# SteadyAlpha — Master Roadmap

## Purpose
This master roadmap merges SteadyAlpha V1 and V2 into a single staged plan with explicit gates, decision criteria, and kill/pivot rules.

The product should evolve in this order:
1. Build a trusted market-intelligence console.
2. Prove it is reliable and analytically useful.
3. Add controlled paper simulation.
4. Add research-grade evaluation.
5. Consider ML only if the baseline earns the right.
6. Consider broker-connected automation only if simulation remains strong and operationally credible.

This roadmap is intentionally conservative. It is designed to prevent premature complexity, fake precision, and architecture-led overbuilding.

---

## Strategic principles

### 1. Product truth over feature breadth
A smaller system that is trusted is more valuable than a larger system that only looks sophisticated.

### 2. Evidence before escalation
No new layer should be added until the previous layer proves value with explicit criteria.

### 3. Honest language
Do not label simulation as execution.
Do not label scoring as intelligence unless it is genuinely adaptive.
Do not label a system as production-ready because it has dashboards and cron jobs.

### 4. Auditability is non-negotiable
Every signal, trade simulation, and model output must be traceable to a run, an input state, and a ruleset or model version.

### 5. Free-tier architecture is a starting constraint, not a product strategy
Use low-cost infrastructure early, but do not let free-tier limitations define long-term system design.

---

## Product evolution model

### Stage A — Trusted Intelligence Console
Goal: build a reliable operator console for market-state assessment and candidate review.

### Stage B — Replay and Decision Validation
Goal: prove the system is useful through deterministic historical reconstruction and signal review.

### Stage C — Controlled Paper Simulation
Goal: connect recommendations to paper orders, paper trades, and portfolio analytics with honest assumptions.

### Stage D — Research and Optional ML
Goal: evaluate whether added modeling materially improves outcomes over simpler baselines.

### Stage E — Automation Decision
Goal: decide whether broker-connected execution is justified, or whether the better product remains a human-in-the-loop intelligence console.

---

## Master roadmap by stage

---

## Stage 0 — Foundation and Operating Model
**Objective:** Create the minimum system skeleton with run tracking, deployment, and failure visibility.

### Deliverables
- Repository structure aligned to engine boundaries.
- Environment setup for GitHub Actions, Supabase, and Vercel.
- `run_registry` table for run lifecycle and idempotency.
- `pipeline_health` table and health UI banner.
- Base frontend shell.
- Config files for universe, thresholds, and environment-specific settings.

### Recommended repository structure
```text
SteadyAlpha/
├── .github/workflows/
│   ├── ci.yml
│   ├── deploy.yml
│   └── pipeline.yml
├── pipeline/
│   ├── feed.py
│   ├── validate.py
│   ├── regime.py
│   ├── flows.py
│   ├── leadership.py
│   ├── risk.py
│   ├── advisor.py
│   ├── replay.py
│   ├── persist.py
│   ├── notify.py
│   └── main.py
├── frontend/
├── supabase/
├── config/
├── tests/
└── README.md
```

### Exit criteria
- App loads successfully.
- Pipeline can start, register, and complete a run.
- Failures are visible in UI and persisted.
- One person can operate the system without hidden state.

### Stage gate: proceed to Stage 1 only if
- There are no silent failures.
- Run IDs and timestamps are consistent.
- The deployment path is stable enough to support daily operation.

### Kill / pivot criteria
- If even basic run registration and health reporting feel brittle, stop feature work and fix operational foundations first.

---

## Stage 1 — Data Reliability Layer
**Objective:** Make source data trustworthy enough for downstream logic.

### Deliverables
- Explicit source hierarchy for each dataset.
- Data validation rules for row count, freshness, nulls, duplicates, and sanity checks.
- Freshness classification: `fresh`, `stale`, `degraded`, `missing`.
- Historical raw snapshot persistence for replay.
- `engine_audit` table for source diagnostics and warnings.
- UI data-status card showing freshness and degraded mode.

### Required behaviors
- Broad market and universe data must be validated before engine execution.
- Stale options data must reduce flows confidence and be visible in UI.
- Partial source failures may degrade output, but must never silently masquerade as high-confidence state.
- Failure to persist a full run must fail the run, not produce misleading partial outputs.

### Core schema additions

> **FIX 1 of 3 — `run_registry`: Added `config_snapshot` and populated `code_version`.**
> Both fields are required for deterministic replay. Without `config_snapshot`, replaying old
> run inputs through current engine config produces different outputs — that is reanalysis, not
> replay. Without `code_version` being explicitly set, the column will be NULL in every row.
> See population mechanism in the pipeline.yml section below.

```sql
CREATE TABLE run_registry (
  run_id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_type     TEXT NOT NULL,       -- scheduled | manual | webhook
  scheduled_ts     TIMESTAMPTZ,
  started_at       TIMESTAMPTZ DEFAULT NOW(),
  completed_at     TIMESTAMPTZ,
  status           TEXT NOT NULL,       -- running | success | failed | partial
  code_version     TEXT NOT NULL,       -- git SHA injected by GitHub Actions (see pipeline.yml)
  config_snapshot  JSONB NOT NULL,      -- serialized contents of all config/ files at run time
  error_summary    TEXT
);

CREATE TABLE engine_audit (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id         UUID REFERENCES run_registry(run_id),
  engine_name    TEXT NOT NULL,
  input_digest   JSONB,
  output_digest  JSONB,
  warnings       JSONB,
  freshness      JSONB,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
```

### Config snapshot population (pipeline `main.py`)
At pipeline startup, before any engine runs, serialize all config files and write to `run_registry`:

```python
import os, json, yaml
from pathlib import Path

def load_config_snapshot() -> dict:
    """Read all config/ files at runtime and return as a single serializable dict."""
    config_dir = Path("config")
    snapshot = {}
    for f in config_dir.iterdir():
        if f.suffix in (".yaml", ".yml"):
            snapshot[f.name] = yaml.safe_load(f.read_text())
        elif f.suffix == ".json":
            snapshot[f.name] = json.loads(f.read_text())
        elif f.suffix == ".csv":
            snapshot[f.name] = f.read_text()  # store raw CSV string
    return snapshot

# In main.py run registration block:
run_id = register_run(
    trigger_type  = os.environ.get("TRIGGER_TYPE", "scheduled"),
    scheduled_ts  = os.environ.get("SCHEDULED_TS"),
    code_version  = os.environ["CODE_VERSION"],      # injected by GitHub Actions
    config_snapshot = load_config_snapshot()
)
```

### `code_version` injection in `pipeline.yml`
`CODE_VERSION` must be passed as an environment variable from the GitHub Actions context.
Without this, `run_registry.code_version` will be NULL in every row.

```yaml
- name: Run Pipeline
  env:
    CODE_VERSION: ${{ github.sha }}        # git commit SHA — guaranteed unique per deploy
    TRIGGER_TYPE: scheduled
    SCHEDULED_TS: ${{ github.event.schedule }}
    SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
    SUPABASE_SERVICE_KEY: ${{ secrets.SUPABASE_SERVICE_KEY }}
  run: python pipeline/main.py
```

### How deterministic replay uses these fields
When replaying a historical run:
1. Load `run_registry.config_snapshot` for the target `run_id`.
2. Temporarily override the live `config/` state with the snapshot values.
3. Feed the raw data snapshot (stored in Stage 1) through the engine logic.
4. Output must match the stored `engine_audit.output_digest` exactly.

If it does not match, the replay is not deterministic — stop and identify what changed
(engine logic, config, or data). Do not proceed to Stage 3 until this holds.

### Exit criteria
- The system can complete runs even when one non-critical feed fails.
- Degraded mode is visible and honest.
- Source provenance can be traced for every important metric.
- Historical snapshots are saved for replay.
- `run_registry` rows contain non-NULL `code_version` and `config_snapshot` for every run.

### Stage gate: proceed to Stage 2 only if
- Data freshness is visible for all major engine inputs.
- Audit logs are sufficient to explain source selection and degradation.
- Replay snapshots are stored consistently.
- Config snapshotting is verified on at least 3 consecutive successful runs.

### Kill / pivot criteria
- If source reliability is poor enough that degraded mode happens frequently, reduce scope to EOD-only before adding more product layers.

---

## Stage 2A — Core Signal Engines
**Objective:** Build and validate the Regime, Flows, and Leadership engines with full audit wiring.

> **FIX 2 of 3 — Stage 2 split into 2A and 2B.**
> The original spec allocated 1 week for all five engines, the aggregated schema, realtime
> wiring, and six UI cards. That is 3–4 weeks of work. Compressing it produces either
> incomplete engines or untested logic shipped to production. Stage 2A covers the three
> market-facing analytical engines. Stage 2B covers Risk, Advisor, and the full UI surface.

### Deliverables
- Regime engine with hysteresis (minimum 2-day confirmation before regime change).
- Flows engine (FII/DII separate, PCR with documented contrarian interpretation, max pain, sector RS).
- Leadership engine (log-ratio RS slope, Z-score normalization, quintile assignment, earnings blackout ±3d).
- `signals_summary` aggregated snapshot table.
- `stock_scores` per-symbol detail table.
- Realtime subscription wired only to `signals_summary` and `pipeline_health`.
- Regime, Flows, and Leadership UI cards (data display only — no advisor output yet).
- Data status card showing per-engine freshness.

### Engine boundaries
#### Regime
Answers: what market state is active, how confident it is, and what base risk posture applies.

#### Flows
Answers: whether participation, sentiment, and sector context confirm or contradict the regime.

#### Leadership
Answers: which symbols qualify under both relative and absolute filters.

### Product rules
- `NO_TRADE`, `WATCHLIST_ONLY`, and `DEGRADED_DATA` must be first-class states from this stage onward.
- Every visible recommendation must include reasoning.
- The UI must not imply execution certainty.

### Exit criteria
- One run produces one coherent `signals_summary` row.
- Regime does not flip on single-day ADX oscillation.
- Leadership quintile output is stable across consecutive runs with unchanged market data.
- All three engines write audit records to `engine_audit`.

### Stage gate: proceed to Stage 2B only if
- Regime, Flows, and Leadership outputs are coherent and explainable.
- Audit records are written and queryable for every run.
- Realtime subscription delivers exactly 1 event per pipeline run.

### Kill / pivot criteria
- If any engine produces consistently unstable or contradictory outputs, pause and fix signal logic before building Risk or Advisor on top of it.

---

## Stage 2B — Risk Engine, Advisor Layer, and Full UI
**Objective:** Add risk controls and the advisor synthesis layer. Complete the intelligence console.

### Deliverables
- Risk engine (ATR-based sizing, circuit breaker logic, drawdown tracking).
- Advisor layer (weighted signal voting, conflict detection, confidence scoring, reasoning generation).
- Risk output merged into `signals_summary`.
- AI Advisor card.
- Risk card with circuit breaker state.
- Pipeline health card.
- End-to-end: one run → one `signals_summary` row → all six UI cards update via realtime.

### Engine boundaries
#### Risk
Answers: whether trading is permitted, and what size posture applies.

#### Advisor
Answers: what action label is justified based on engine outputs. The Advisor does not re-score upstream raw inputs. It synthesizes the outputs of Regime, Flows, Leadership, and Risk only.

### Exit criteria
- One run produces one coherent signal snapshot covering all engines.
- Every displayed recommendation can be explained through stored audit traces.
- Signal freshness and degraded state are visible across all cards.
- Candidate output is stable enough for daily operational review.
- Circuit breaker state renders correctly under simulated drawdown conditions.

### Stage gate: proceed to Stage 3 only if
- Signal logic is trusted enough for daily review.
- Recommendation explanations are concise and credible.
- Regime state does not thrash on minor market noise.
- Candidate churn is acceptable for the intended positional trading style.

### Kill / pivot criteria
- If the engines look smart but produce noisy, unstable, or contradictory outputs, pause roadmap expansion and refactor signal logic first.

---

## Stage 3 — Replay and Human Workflow
**Objective:** Turn the intelligence console into a practical daily operator tool.

### Deliverables
- Deterministic replay engine (uses `config_snapshot` + raw data snapshot from Stage 1).
- Historical day reconstruction in UI.
- Day-over-day signal diff view.
- Watchlist management.
- Manual journal / notes.
- Review tags: `watch`, `stalking`, `entered manually`, `ignored`, `invalidated`.
- End-of-day summary view.

### Product value of this stage
This is the stage where SteadyAlpha becomes genuinely useful even without execution or ML.
It should help the operator review state, make decisions, and learn from outcomes.

### Replay determinism requirement
A replay is deterministic if and only if:
- The raw data snapshot for the run is intact in storage.
- The `config_snapshot` for the run is loaded before engine execution.
- The engine code version matches the stored `code_version` (or differences are explicitly accounted for).

Replay that produces different outputs from the original run is not replay. It must be labeled
"reanalysis" and stored separately from the original audit record.

### Exit criteria
- Historical runs can be reconstructed exactly.
- Review workflow can happen inside the product.
- The operator can compare recommendations with subsequent outcomes.
- Daily use reduces dependence on external spreadsheets or ad hoc notes.

### Stage gate: proceed to Stage 4 only if
- Replay is deterministic (output matches stored `engine_audit.output_digest`).
- The journal/watchlist workflow is actually being used.
- There is enough historical recommendation context to support simulation design.

### Kill / pivot criteria
- If replay is not deterministic, stop. Fix config snapshotting and data persistence before proceeding.
- If users are not using the workflow or replay features, investigate whether the product is solving the right problem before adding simulation.

---

## Stage 4 — Controlled Paper Simulation
**Objective:** Add honest trade simulation on top of trusted recommendations.

### Deliverables
- `paper_orders` instead of `trade_requests`.
- `paper_trades` instead of `trades`.
- Simulated fill engine with explicit assumptions.
- Portfolio snapshots and equity tracking.
- Recommendation-to-order lineage.
- Recommendation-to-outcome attribution.

### Required naming discipline
Never call a paper trade an executed trade.
Never imply broker-confirmed execution.

### Core schema additions
```sql
CREATE TABLE paper_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              UUID REFERENCES run_registry(run_id),
  recommendation_id   UUID,
  symbol              TEXT NOT NULL,
  direction           TEXT NOT NULL,
  requested_qty       INT NOT NULL,
  requested_at        TIMESTAMPTZ DEFAULT NOW(),
  status              TEXT NOT NULL,       -- pending | filled | rejected
  rejection_reason    TEXT
);

CREATE TABLE paper_trades (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  paper_order_id       UUID REFERENCES paper_orders(id),
  symbol               TEXT NOT NULL,
  direction            TEXT NOT NULL,
  entry_price          FLOAT,
  exit_price           FLOAT,
  qty                  INT,
  slippage_bps         FLOAT,
  entry_at             TIMESTAMPTZ,
  exit_at              TIMESTAMPTZ,
  pnl                  FLOAT,
  exit_reason          TEXT,
  simulation_version   TEXT    -- versions the fill model config, not the code SHA
);
```

### Fill model requirements
- Entry timing rule.
- Exit timing rule.
- Gap handling.
- Slippage assumptions.
- Lot-size rounding.
- Rejection logic when liquidity or price invalidates the setup.
- Versioning so historical fill logic is never silently rewritten.

### Exit criteria
- Every paper trade maps back to a recommendation snapshot.
- Fill assumptions are visible and reproducible.
- Portfolio state reconciles with paper trade history.
- Segmented analytics by regime and confidence bucket are available.

### Stage gate: proceed to Stage 5 only if
- Simulation integrity is trusted.
- Performance can be explained by regime, signal class, and confidence bucket.
- Added complexity appears to provide value over simpler baselines.

### Kill / pivot criteria
- If simulation relies on unrealistic fill logic or produces metrics that cannot be reproduced, stop and repair the simulation layer before expanding further.

---

## Stage 5 — Evaluation and Optional ML Research
**Objective:** Determine whether data and baseline performance justify ML.

### Deliverables
- Outcome labeling.
- Evaluation slices by regime, sector, confidence, volatility state, and holding horizon.
- Baseline comparisons against simpler systems.
- Optional feature dataset generation for ML.
- Walk-forward validation framework.
- Calibration analysis.

### Evaluation rules
The system must answer whether its complexity is earning its keep.

Compare against at least:
- Regime-only baseline.
- Leadership-only baseline.
- Top-RS ranking without advisor weighting.
- Advisor-weighted baseline.

### ML readiness conditions
ML work may begin only if all of the following are true:
- Sufficient labeled outcomes exist (minimum ~600 labeled samples across at least 3 walk-forward folds; at 1 signal/day this requires approximately 2.5 years of live data — plan accordingly).
- Feature logging is stable.
- No known leakage exists.
- Replay and labels are trusted.
- Non-ML baseline already has measurable value.

### Good ML use cases first
- Ranking within already qualified candidates.
- Confidence calibration.
- Suppression of low-quality setups.
- Detecting conflict patterns that historically fail.

### Bad ML use cases first
- End-to-end buy/sell prediction with thin data.
- Replacing the rule engine wholesale.
- Treating AUC as product truth without operational validation.

### ML validation gates (if ML is attempted)
- AUC > 0.60 on out-of-sample walk-forward (not 0.55 — marginally above coin flip is insufficient).
- Brier Score < 0.22 (calibration quality).
- Top-decile lift ≥ 1.5× baseline hit rate.
- If these gates are not cleared, ship without ML. Keep the rule-based Tier 1 advisor.

### Exit criteria
- Complex logic beats simpler baselines after realistic assumptions.
- ML, if tested, adds value over non-ML baseline and clears all three validation gates.
- Model outputs are auditable and reproducible.

### Stage gate: proceed to Stage 6 only if
- Baseline and optional ML results hold across regimes.
- The system remains interpretable after added complexity.
- Evidence supports further automation investment.

### Kill / pivot criteria
- If ML adds noise, cut it. Complexity is optional; clarity is not.

---

## Stage 6 — Automation Decision
**Objective:** Decide whether to stay decision-support-first or explore broker-connected execution.

### Decision paths
#### Path A — Stay human-in-the-loop
Choose this if the dashboard, replay, and simulation already create strong decision value,
and live automation would add risk without commensurate benefit.

#### Path B — Explore broker-connected execution
Choose this only if simulation remains strong across regimes and operational controls
can be added responsibly.

### Preconditions for broker integration exploration
- Stable paper simulation over time.
- Clear evidence of positive value after realistic slippage.
- Robust kill-switch design.
- Order-state recovery design.
- Reconciliation with broker reality.
- Market-hours safeguards.
- Security and secrets management maturity.
- Monitoring and alerting beyond basic pipeline health.

### Exit criteria
- A clear strategic choice exists: continue as operator console or invest in execution productization.

### Kill / pivot criteria
- If automation is driven mainly by ambition rather than evidence, do not build it.

---

## Master stage gates summary

| Stage | Gate question | Proceed if | Hold if | Kill / Pivot if |
|---|---|---|---|---|
| 0 Foundation | Can the system run visibly and predictably? | Runs register, fail visibly, and deploy cleanly | Minor operational bugs remain | Basic run lifecycle is not trustworthy |
| 1 Data reliability | Can inputs be trusted? | Freshness, provenance, config snapshot, and degraded mode work | Some source validation still incomplete | Source quality is too weak for confident downstream logic |
| 2A Signal engines | Are Regime, Flows, and Leadership credible? | Outputs are coherent, stable, and audit-wired | Some thresholds need tuning | Any engine is noisy, brittle, or contradictory |
| 2B Risk + Advisor | Is the full intelligence console coherent? | All engines integrate cleanly, full UI renders correctly | Minor UI rough edges remain | Advisor produces contradictory or unexplainable outputs |
| 3 Replay + workflow | Is the product useful in daily practice? | Replay is deterministic; workflow is used | UX still rough but learning loop exists | Replay is not deterministic; no one uses the workflow |
| 4 Paper simulation | Are simulated outcomes honest and reproducible? | Lineage and fill assumptions are trusted | Portfolio analytics still immature | Fill logic is unrealistic or unreproducible |
| 5 Evaluation / ML | Does added complexity beat simple baselines? | Baseline and optional ML add measured value | More evaluation time needed | ML adds noise or complexity without clear lift |
| 6 Automation decision | Is live automation justified? | Evidence supports broker integration | Human-in-loop remains better for now | Automation demand is based on aspiration, not proof |

---

## Decision criteria by category

### Reliability criteria
- Scheduled runs succeed consistently.
- Every run writes health and audit records.
- No silent failures.
- Data freshness is visible for all major datasets.
- Realtime delivery does not create duplicate or partial UI states.
- `run_registry` rows contain non-NULL `code_version` and `config_snapshot` for every run.

### Product criteria
- Daily review can happen inside the product.
- Signals are interpretable in seconds, not minutes.
- Ambiguous conditions are shown honestly as low-confidence or no-trade states.
- The product reduces cognitive load rather than adding dashboards for their own sake.

### Analytical criteria
- Signals can be evaluated by regime bucket.
- Conflicted setups underperform aligned setups.
- Candidate selection quality is measurable.
- Replay and simulation are reproducible.

### Complexity criteria
A new layer should be added only if it improves one of the following:
- decision quality,
- operator speed,
- risk control,
- or learning velocity.

If it only increases architectural sophistication, it should be deferred.

---

## Suggested timeline
This is the realistic sequence, not the optimistic one.

| Phase | Duration | Outcome |
|---|---:|---|
| Stage 0 | 1 week | Stable deployment, run registry, health reporting |
| Stage 1 | 1 week | Trustworthy data with config snapshotting verified |
| Stage 2A | 2 weeks | Regime, Flows, Leadership engines live and audit-wired |
| Stage 2B | 1 week | Risk + Advisor integrated; full six-card UI complete |
| Stage 3 | 1–2 weeks | Deterministic replay and daily operator workflow |
| Stage 4 | 2 weeks | Honest paper simulation with fill model versioning |
| Stage 5 | 3+ weeks | Evaluation and optional ML research |
| Stage 6 | Decision point | Stay manual-first or explore automation |

Total realistic path: approximately 11–13 weeks for a robust V1-to-V2 progression, excluding broker integration.

> The previous estimate of 8–10 weeks was based on a 1-week Stage 2 allocation. Stage 2 contains
> five complex engines, aggregated schema design, realtime wiring, and six UI cards. 3 weeks is
> the honest minimum. The additional 2–3 weeks in the revised estimate reflects that, not scope creep.

---

## What should be deferred by default
- Broker execution.
- Multi-user SaaS complexity.
- Weekly ML retraining in production.
- SHAP and explanation tooling before baseline validity.
- Kelly sizing.
- Claims of autonomy or zero manual intervention.

---

## Anti-goals
The roadmap should explicitly avoid these traps:
- Building paper execution before the recommendation engine is trusted.
- Using ML to paper over weak signal logic.
- Treating free-tier infrastructure as if it were production-grade by default.
- Shipping attractive charts that are analytically shallow.
- Confusing activity with progress.

---

## Final operating recommendation
SteadyAlpha should be managed as a staged evidence program, not a feature roadmap.

The correct sequence is:
1. trust,
2. explanation,
3. replay,
4. simulation,
5. evaluation,
6. optional ML,
7. only then automation.

Anything faster is mostly self-deception.
