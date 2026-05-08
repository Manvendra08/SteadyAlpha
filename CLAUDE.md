# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SteadyAlpha** is a staged market-intelligence and trading simulation system designed for positional trading. The system emphasizes operational honesty, deterministic replay, and evidence-based evolution. Phase 0 (Foundation and Operating Model) is complete; Stage 1 (Data Reliability Layer) is active.

**Core Principles:** Reliability > Speed, Auditability > Elegance, Replayability > Simulation, Simulation > ML, Evidence > Automation.

## Architecture

```
SteadyAlpha
├── frontend/                  # Next.js console UI (React 18, TypeScript, Tailwind)
├── pipeline/                  # Python 3.12 data processing and signal engines
│   ├── engines/              # Five signal engines + orchestration
│   ├── main.py              # Pipeline orchestrator
│   └── persist.py           # Supabase persistence layer
├── supabase/                  # PostgreSQL migrations and schema
├── config/                    # Runtime config (YAML) - loaded by each engine
├── tests/                     # Test directory (currently building out)
└── .github/workflows/         # GitHub Actions - daily scheduled pipeline + manual dispatch
```

## Signal Engine Architecture

The pipeline uses a five-stage signal orchestration model:

1. **Regime Engine** (`pipeline/engines/regime.py`)
   - Input: close prices, VIX, market breadth, prior state
   - Output: `{state: str, trend_score: float, ...}`
   - Logic: EMA-based trend detection (bullish/bearish/range-bound) + hysteresis

2. **Flows Engine** (`pipeline/engines/flows.py`)
   - Input: FII net flows, Put-Call Ratio, sector prices
   - Output: `{flows_score: float, fii_5d_z: float, pcr_smooth: float, ...}`
   - Logic: Z-score normalization of institutional sentiment

3. **Leadership Engine** (`pipeline/engines/leadership.py`)
   - Input: stock prices (universe), volume data, benchmark
   - Output: `{leaders_count: int, avg_score: float, universe_size: int, ...}`
   - Logic: Identifies outperforming stocks with volume confirmation

4. **Risk Engine** (`pipeline/engines/risk.py`)
   - Input: account equity, positions, equity curve
   - Output: `{status: str, portfolio_risk: dict, circuit_breaker: dict, ...}`
   - Logic: Position sizing, drawdown tracking, halt conditions

5. **Advisor** (`pipeline/engines/advisor.py`)
   - Input: All four engine outputs (regime, flows, leadership, risk)
   - Output: `{action: str, score: float, confidence: float, components: dict, ...}`
   - Logic: Weighted voting (45% regime, 30% flows, 25% leadership) + conflict detection

All engines return immutable dicts; the pipeline consolidates these into a single `results` dict and persists to Supabase.

## Signal Engine Logic Reference

For detailed engine formulas, thresholds, edge cases, and validation:
- **Primary Reference:** `Signal Engine & Dashboard — Technical Specification.md` (v0.4+)
- **Regime Engine (Section 2):** trend_score formula, EMA alignment, hysteresis, confidence calculation
- **Flows Engine (Section 3):** FII z-score thresholds, PCR contrarian logic, sector rotation detection
- **Leadership Engine (Section 4):** Quintile ranking, composite score weights, absolute filters, earnings/corporate blackouts
- **Risk Engine (Section 5):** Position sizing formula, circuit breaker thresholds, portfolio limits
- **Decision Aggregator (Section 6):** Voting weights, conflict detection rules, action mapping
- **Config Keys (Section 10):** All magic numbers, their defaults, and valid ranges

Each engine section includes data freshness rules, empty-result handling, and output schema validation.

## Development Commands

### Frontend

```bash
cd frontend
npm install              # Install dependencies
npm run dev             # Start dev server (http://localhost:3000)
npm run build           # Production build
npm run start           # Start production server
npm lint                # Run ESLint
npm test                # Run Jest (when tests exist)
```

### Pipeline - Local Execution

```bash
# Setup Python environment (one-time)
python -m venv venv
source venv/Scripts/activate  # Windows
# or: source venv/bin/activate  # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run pipeline (loads mocked market data, outputs to stdout by default)
python pipeline/main.py

# Run a single engine in isolation (for debugging)
python -c "from pipeline.engines.regime import RegimeEngine; engine = RegimeEngine(); print(engine.run(...))"
```

### Pipeline - Testing

```bash
# Run all tests
python -m pytest tests/ -v

# Run a single test file
python -m pytest pipeline/test_db.py -v

# Run tests with coverage report (target: 80%+)
python -m pytest tests/ --cov=pipeline --cov-report=html

# Run specific test function
python -m pytest tests/test_advisor.py::test_advisor_weighted_voting -v
```

### Pipeline - Engine Debugging

Test individual engines in isolation with explicit inputs:

```python
# Debug Regime Engine
from pipeline.engines.regime import RegimeEngine
import yaml

cfg = yaml.safe_load(open('config/default.yaml'))
engine = RegimeEngine(cfg)

result = engine.run(
    close=2600.0, ema20=2550.0, ema50=2500.0, ema200=2400.0,
    ema20_prev=2548.0, ema50_prev=2498.0,
    adx_14=28.5, vix_value=15.0, vix_percentile=45.0, breadth_pct=62.0,
    prev_regime="TREND_UP", prev_candidate_regime="TREND_UP", prev_candidate_days=0
)
print(result)  # Check trend_score, confidence, regime output
```

**Output validation checklist by engine:**
- **Regime:** `trend_score` in [-10, +10], `confidence` in [0, 1.0], regime is one of 6 valid states
- **Flows:** `flows_score` in [-2.25, +2.25], `bias` is LONG/SHORT/NEUTRAL, `drivers` list populated
- **Leadership:** `status` is OK or INSUFFICIENT_CANDIDATES, quintiles properly assigned, `leaders` / `laggards` lists non-empty only when regime allows
- **Risk:** `circuit_breaker` in {HALTED, REDUCED, ACTIVE}, `final_position_size` ≥ 0, `tradable` is bool
- **Advisor:** `direction_vote` in [-1.0, +1.0], `agreement_count` in [0, 3], `action` is one of {LONG, SHORT, LONG_SMALL, SHORT_SMALL, NO_TRADE}

Logs go to stdout; redirect to `pipeline.log` if needed. Enable debug mode in config for verbose output.

### Configuration

Runtime config files (YAML) go in `config/` and are automatically loaded by each engine:
- Each engine's `__init__` loads `config/default.yaml` via `yaml.safe_load()`
- Config is versioned: every run stores a snapshot in `run_registry.config_snapshot` for reproducibility
- Thresholds set here: regime ADX/breadth/VIX, flows z-score/PCR percentiles, risk sizing/circuit breakers, advisor voting weights

**Common config keys:**
```yaml
regime:
  min_adx_trend: 25              # Trending threshold
  min_trend_score: 3             # EMA composite strength
  high_vol_vix_pct: 75           # VIX percentile for HIGH_VOL detection

flows:
  fii_z_strong: 1.0              # Z-score magnitude for FII scoring
  pcr_high_pct: 80               # PCR percentile for contrarian bullish
  min_sector_rs_spread: 0.010     # Min RS slope spread for sector rotation

leadership:
  w_rs_slope: 0.55               # Relative strength weight in composite
  min_turnover_inr: 50000000     # Minimum ₹5Cr avg daily turnover

risk:
  account_risk_pct: 0.75         # % risked per trade
  halt_session_loss_pct: 1.5     # Intraday loss threshold for HALTED
  max_open_positions: 6          # Portfolio-level cap

advisor:
  w_regime: 0.45
  w_flows: 0.30
  w_leadership: 0.25
  confidence_full: 0.65          # Full action threshold
  confidence_small: 0.50         # Small position threshold
```

For the complete list of ~40 config keys with defaults and valid ranges, see the spec (Section 10).

## Environment Variables

### Local Development

Create a `.env` file in the project root:
```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Note:** The code looks for `SUPABASE_SERVICE_ROLE_KEY`, not `SUPABASE_KEY`. Using the service role key (not anon key) is required for full database access.

If env vars are missing, the pipeline prints a warning and continues with persistence disabled (results logged to stdout only).

### GitHub Actions

Secrets are configured at repo level:
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_KEY` - Service role key (passed as `SUPABASE_SERVICE_ROLE_KEY` in workflow)
- The workflow runs at 10:00 UTC daily and on manual dispatch (`workflow_dispatch`)

## Data Flow & Mocking

**Current State (Foundation Phase):**
- `load_data()` in `main.py` generates mock market data (OHLCV, VIX, FII, PCR, etc.)
- Each engine receives mock data, calculates signals, returns results dict
- `persist_full_run()` either writes to Supabase (if connected) or prints to stdout

**Mocking Pattern:**
```python
# Example from main.py:
dates = pd.date_range(end=datetime.now(timezone.utc), periods=300, freq='B')
close = pd.Series(100 + np.random.randn(300).cumsum(), index=dates)
# All data is synthetic, suitable for validation/demo
```

**Migration Path:**
1. Replace `load_data()` with real market data API (e.g., Alpha Vantage, yfinance)
2. Ensure Supabase credentials are present in environment
3. Persistence layer (`persist.py`) is ready; just ensure schema migrations have run

## Data Freshness Requirements

Pipeline execution HALTS (all engines skip) if critical inputs are stale. Check freshness in `load_data()`:

| Data | Stale Threshold | Fallback Behavior |
|:---|:---|:---|
| Nifty 50 EOD | > 1 trading day | **FAIL run** — log error |
| F&O 200 EOD | > 1 trading day | **FAIL run** — log error |
| India VIX | > 1 trading day | Use last known value; skip volatility scoring |
| FII flows | > 2 trading days | Omit FII component from flows; log warning |
| PCR OI | > 1 trading day | Skip PCR scoring; omit from drivers |
| Sector indices | > 1 trading day | Skip sector rotation scoring |

If running on a **non-trading day** (weekend, holiday, or EOD timestamp doesn't match run date), skip engine execution and do not persist a new row.

## Persistence & Database

`persist.py` handles all Supabase writes via a `PersistenceManager` class:
- `persist_full_run(results, duration_ms)`: Master method that writes to 5 tables
  - `run_registry`: Run metadata (id, timestamp, status, duration)
  - `signals_summary`: JSONB blobs of all signal outputs
  - `regime_history`, `flows_history`, etc.: Flattened per-signal tables
- If Supabase client init fails, a warning is printed and persistence is skipped
- Errors during insert are caught and logged; run status is updated to 'failed'

**Schema Assumption:** Tables exist in Supabase with the expected columns. Migrations in `supabase/migrations/` define the schema.

## Frontend-Backend Integration

Frontend components consume pipeline outputs:
- `HealthBanner.tsx`: Displays pipeline status, last success timestamp. Currently mocked; will query `run_registry` table
- `RegimeCard.tsx`, `FlowsCard.tsx`, `LeadershipCard.tsx`, `RiskCard.tsx`, `AdvisorCard.tsx`: Display engine outputs. Will consume `signals_summary` JSONB
- `ChangeTracker.tsx`: Tracks signal changes over runs. Will query history tables
- Paper trading components (`PaperOrdersTable.tsx`, etc.): Consume simulated orders. Schema pending

**Current Status:** Components are styled and structured; API integration is pending (awaiting Supabase schema confirmation).

## Code Organization

**Spec-first reference:**
- **`Signal Engine & Dashboard — Technical Specification.md`** (v0.4+): Canonical source for all engine logic, formulas, thresholds, and validation rules. All implementations must conform to this spec.

**Frontend:**
- **`frontend/app/page.tsx`:** Home dashboard component
- **`frontend/components/`:** Signal cards (Regime, Flows, Leadership, Risk, Advisor), health banner, data tables

**Pipeline & Engines:**
- **`pipeline/main.py`:** Orchestrator; loads config, calls engines sequentially, handles persistence
- **`pipeline/engines/regime.py`:** Regime classification (EMA, ADX, breadth, VIX percentile, hysteresis)
- **`pipeline/engines/flows.py`:** Flows scoring (FII z-score, PCR contrarian, sector rotation)
- **`pipeline/engines/leadership.py`:** Candidate identification (quintile ranking, composite score, absolute filters)
- **`pipeline/engines/risk.py`:** Position sizing and circuit breakers (ATR, session loss, peak drawdown)
- **`pipeline/engines/advisor.py`:** Signal aggregation (weighted voting, conflict detection, action mapping)
- **`pipeline/backtest.py`:** Replay engine for historical validation (NEW in v0.4)
- **`pipeline/persist.py`:** Supabase abstraction (run_registry, signals_summary, history tables)

**Configuration & Schema:**
- **`config/default.yaml`:** All runtime parameters (40+ keys with defaults)
- **`supabase/migrations/`:** Database schema definitions (run_registry, signals_summary, regime_history, flows_history, stock_scores)

## Testing Strategy

**Target:** 80% code coverage per project standards

**Test types:**
- **Unit Tests:** Engine logic (trend_score formula, quintile ranking, circuit breaker thresholds)
  ```bash
  pytest tests/test_regime.py::test_trend_score -v
  pytest tests/test_leadership.py::test_quintile_ranking -v
  pytest tests/test_risk.py::test_circuit_breaker -v
  ```
- **Integration Tests:** Pipeline orchestration and cross-engine data flow
  ```bash
  pytest tests/test_pipeline.py -v
  ```
- **End-to-End Tests:** Full run with mocked data, persistence validation
  ```bash
  pytest tests/test_e2e.py -v
  ```

**Backtest Validation (v0.4+):**
Signal quality is validated via backtests. Pass criteria:
- **Sharpe Ratio** ≥ 0.8 (excess return per unit of risk)
- **Max Drawdown** ≤ 15% (portfolio resilience)
- **Win Rate** ≥ 45% (probability of profitable trades)
- **Monthly Return Distribution:** mean > 0, skew acceptable

Run backtest:
```bash
python pipeline/backtest.py --config config/backtest.yaml --start 2025-01-01 --end 2025-12-31
```

**Immutability Rule:** Engines must not mutate input data. Return new dicts for all outputs.
**Config Validation:** All config keys in `cfg` must exist in schema (Section 10 of spec) and fall within valid ranges.

## Common Tasks

### Running Pipeline Locally Without Supabase

```bash
# Unset env vars or leave .env unset
unset SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY

# Run pipeline - will print warning and skip persistence
python pipeline/main.py
# Output: "Warning: DB not configured. Persistence disabled."
```

### Adding a New Signal Engine

1. Create `pipeline/engines/new_engine.py` with a class `NewEngine`
2. Implement `__init__(config_path)` to load config, and `run(**inputs)` to return `Dict[str, Any]`
3. Import and instantiate in `main.py` pipeline init
4. Call `new_engine.run(...)` in the orchestration loop
5. Add output to `results` dict before persistence
6. Add persistence method to `persist.py` (e.g., `insert_new_engine_history()`)
7. Ensure Supabase schema includes the new table

### Debugging a Single Engine

```python
from pipeline.engines.regime import RegimeEngine
import pandas as pd

engine = RegimeEngine()
dates = pd.date_range(periods=300, freq='B')
close = pd.Series(100 + np.random.randn(300).cumsum(), index=dates)

result = engine.run(close=close, vix=15.0, breadth_pct=0.7, previous_state="BULLISH", days_in_state=5)
print(result)
```

## Important Notes

- **Configuration is Immutable Per Run:** Config is loaded once at pipeline init; engines reference it throughout
- **Timestamps:** All outputs include a `timestamp` field (UTC); ensure consistency across engines
- **Hysteresis:** Regime engine uses hysteresis to prevent state flickering (see `min_confirm_days` in config)
- **Weighted Voting:** Advisor applies configurable weights; default is regime 45%, flows 30%, leadership 25%
- **Conflict Detection:** Advisor flags when engines disagree on direction (sign flip), reducing confidence
- **Risk Override:** If Risk engine status is 'HALTED', Advisor action is forced to 'HALT' regardless of signals
