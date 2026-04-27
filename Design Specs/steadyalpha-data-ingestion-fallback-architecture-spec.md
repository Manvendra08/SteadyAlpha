# SteadyAlpha Data Ingestion & Fallback Architecture Spec

## Purpose
This document defines the production-grade ingestion architecture for SteadyAlpha so the system can operate on real market data, degrade safely when a source fails, and never silently substitute random mock values into trading logic.

The design goal is simple:
- fetch real data first,
- fall back safely,
- validate aggressively,
- cache last known good real snapshots,
- and invalidate the run when critical data is unavailable.

## Non-negotiable rules
1. Random mock data must never enter the trading path.
2. Scraping is allowed only as a controlled fallback, not the default architecture.
3. Every dataset must have explicit source type and freshness.
4. Critical datasets must invalidate trading when unavailable.
5. Cached real data is acceptable for diagnostics and some limited fallback cases, but it must be labeled clearly.
6. The pipeline must persist provenance for every dataset used in a run.

## Source type model
Every dataset must be tagged as exactly one of:
- `REAL`
- `FALLBACK`
- `SCRAPED`
- `CACHED`
- `DERIVED`
- `CONFIG`
- `MISSING`

### Meanings
- `REAL`: primary structured source succeeded.
- `FALLBACK`: structured secondary source succeeded.
- `SCRAPED`: HTML/page parsing fallback used.
- `CACHED`: last valid real snapshot reused.
- `DERIVED`: computed from other real/fallback datasets.
- `CONFIG`: static configuration file.
- `MISSING`: no usable source available.

## Freshness model
Every dataset must also be tagged as:
- `FRESH`
- `STALE`
- `MISSING`

Do not use freshness to represent mock or fallback. That is source type, not freshness.

## Criticality model
Each dataset must be classified as:
- `CRITICAL_FOR_DECISION`
- `CRITICAL_FOR_RISK`
- `IMPORTANT_NONCRITICAL`
- `DIAGNOSTIC_ONLY`

## Dataset inventory

### 1. Nifty 50 OHLCV
Purpose: regime, trend score, ADX, baseline market structure.
Criticality: `CRITICAL_FOR_DECISION`

Source ladder:
1. `yfinance` for `^NSEI`
2. NSE bhavcopy or direct historical file reconstruction
3. last valid cached real snapshot
4. else `MISSING`

Failure rule:
- If unavailable, regime engine cannot be `READY`.
- Trading validity becomes `NO`.

### 2. India VIX
Purpose: VIX value, VIX percentile, high-volatility override.
Criticality: `CRITICAL_FOR_DECISION`

Source ladder:
1. `yfinance` for `^INDIAVIX` or stable direct source
2. exchange-published file or stable structured endpoint
3. last valid cached real snapshot
4. controlled scrape if a stable public page exists
5. else `MISSING`

Failure rule:
- If unavailable, regime confidence must be capped or regime invalidated based on rule config.
- Hardcoded constants are forbidden.

### 3. FII Cash Flows
Purpose: flows engine directional signal.
Criticality: `CRITICAL_FOR_DECISION`

Source ladder:
1. `nsepython` or direct NSE source
2. exchange-published CSV/file if available
3. controlled scrape of published table page
4. last valid cached real snapshot, marked stale
5. else `MISSING`

Failure rule:
- If unavailable, flows engine cannot be `READY`.
- Decision must downgrade or invalidate based on configuration.

### 4. DII Cash Flows
Purpose: supporting flows context.
Criticality: `IMPORTANT_NONCRITICAL`

Source ladder:
1. `nsepython` or direct NSE source
2. published file endpoint
3. controlled scrape
4. cached real snapshot
5. else `MISSING`

Failure rule:
- Missing DII alone may degrade but should not necessarily invalidate trading if core flow decision inputs remain valid.

### 5. PCR OI
Purpose: options sentiment input.
Criticality: `CRITICAL_FOR_DECISION`

Source ladder:
1. `nsepython` option-chain source
2. direct structured option-chain endpoint
3. controlled scrape of option-chain page
4. cached real snapshot marked stale
5. else `MISSING`

Failure rule:
- If strategy logic uses PCR directly, missing PCR blocks full flow readiness.

### 6. Max Pain / OI Distribution
Purpose: options positioning context.
Criticality: `IMPORTANT_NONCRITICAL` or `CRITICAL_FOR_DECISION` depending on strategy config.

Source ladder:
1. structured option-chain endpoint
2. controlled scrape of option-chain table
3. cached real snapshot
4. else `MISSING`

### 7. Sector Indices
Purpose: sector relative strength and sector alignment.
Criticality: `IMPORTANT_NONCRITICAL`

Source ladder:
1. `yfinance` sector index symbols or stable direct index source
2. exchange files if available
3. controlled scrape of sector tables
4. cached real snapshot
5. else `MISSING`

Failure rule:
- Should degrade flows/leadership context, not necessarily invalidate the run unless your decision logic depends on it.

### 8. Universe OHLCV
Purpose: leadership engine and breadth.
Criticality: `CRITICAL_FOR_DECISION`

Source ladder:
1. `yfinance` batched symbol fetch
2. NSE bhavcopy plus historical reconstruction
3. cached real historical store per symbol
4. else `MISSING`

Failure rule:
- If coverage falls below threshold, leadership status becomes `DEGRADED` or `FAILED`.
- If breadth depends on this universe, regime may also degrade.

### 9. Delivery Data
Purpose: delivery score.
Criticality: `IMPORTANT_NONCRITICAL`

Source ladder:
1. structured NSE source
2. exchange file
3. controlled scrape
4. cached real snapshot
5. else `MISSING`

### 10. Previous Regime State
Purpose: hysteresis and state persistence.
Criticality: `IMPORTANT_NONCRITICAL`
Source ladder:
1. Supabase persisted history
2. else `MISSING`

### 11. Equity Curve / Drawdown State
Purpose: risk gating.
Criticality: `CRITICAL_FOR_RISK`

Source ladder:
1. persisted paper/live trade ledger
2. broker-derived position/equity state when live integration exists
3. else `MISSING`

Failure rule:
- If unavailable, risk engine cannot gate execution.
- Risk status becomes `FAILED` or `SIMULATED` only in explicit sandbox mode.
- Trading validity becomes `NO`.

### 12. ATR / Sizing Inputs
Purpose: risk and sizing.
Criticality: `CRITICAL_FOR_RISK`

Source ladder:
1. derived from valid Nifty or instrument OHLCV
2. cached real historical store
3. else `MISSING`

Failure rule:
- No ATR means no valid sizing for execution.

## Architecture components

### A. Fetch adapters
Create one adapter per dataset family.

Recommended modules:
- `pipeline/adapters/nifty_ohlcv.py`
- `pipeline/adapters/vix.py`
- `pipeline/adapters/fii_dii.py`
- `pipeline/adapters/options_chain.py`
- `pipeline/adapters/sector_indices.py`
- `pipeline/adapters/universe_ohlcv.py`
- `pipeline/adapters/delivery.py`
- `pipeline/adapters/risk_state.py`

Each adapter must return a common result shape.

```python
from dataclasses import dataclass
from typing import Any, Optional

@dataclass
class FetchResult:
    dataset_key: str
    provider: str
    source_type: str
    freshness: str
    criticality: str
    success: bool
    trading_valid: bool
    market_date: Optional[str]
    fetched_at: Optional[str]
    record_count: Optional[int]
    payload: Any
    warning: Optional[str] = None
    error: Optional[str] = None
```

### B. Orchestrator
Create a central ingestion orchestrator in `pipeline/feed.py` or `pipeline/ingestion.py` that:
- calls adapters in priority order,
- validates outputs,
- caches successful real payloads,
- records provenance,
- and determines run validity before engines execute.

### C. Cache layer
Store last valid real snapshot per dataset.

Cache rules:
- cache only successful real, fallback, or scraped payloads that pass validation.
- never cache random placeholders.
- attach `market_date`, `fetched_at`, and `provider`.
- configurable time-to-live by dataset.

Recommended storage:
- Supabase tables for metadata and small payloads.
- object storage for larger payload artifacts if needed.

### D. Validation layer
Every dataset must have schema and sanity validation before it is accepted.

Examples:
- Nifty OHLCV must include date/open/high/low/close/volume.
- India VIX must be numeric and non-negative.
- FII/DII values must be numeric.
- PCR must be within a reasonable range.
- universe coverage must meet minimum threshold.

If validation fails, do not pass the dataset downstream even if fetch technically succeeded.

## Scraping policy
Scraping is allowed, but only under these rules:

1. Use scraping only after structured sources fail.
2. Implement scraping in dedicated adapters, never inline in engine logic.
3. Validate schema and content aggressively after scrape.
4. Mark source type as `SCRAPED`.
5. Mark trading validity by dataset-specific rules.
6. Persist the page fetch timestamp and parse warnings.
7. Add tests that fail when HTML structure changes.

### Good scraping candidates
- option-chain table pages
- cash-flow summary tables
- delivery pages
- sector-performance pages

### Bad scraping candidates
- large OHLCV history where exchange files exist
- datasets already available via stable download or file endpoints

## Run-validity gating
Before engine computation, compute run validity.

### Run validity values
- `YES`
- `PARTIAL`
- `NO`

### Rules
Set `YES` only when all critical decision and risk datasets are trading-valid.

Set `PARTIAL` when:
- diagnostics can run,
- some noncritical datasets are degraded,
- but paper/live promotion remains blocked or strategy confidence is capped.

Set `NO` when any critical dataset is missing, invalid, mock, or stale beyond threshold.

## Engine gating rules

### Regime engine
Requires:
- valid Nifty OHLCV
- valid VIX or configured degraded-mode rule
- valid breadth inputs if breadth is part of regime logic

### Flows engine
Requires:
- valid FII input
- valid PCR if PCR is used in voting
- valid spot/max-pain relation if max-pain logic is active

### Leadership engine
Requires:
- valid universe membership
- sufficient OHLCV coverage
- valid volume history

### Risk engine
Requires:
- valid ATR input
- valid equity/drawdown input
- valid trade history where required

### Decision engine
Requires:
- outputs from regime, flows, leadership, and risk with explicit validity flags
- must emit `INVALID_FOR_TRADING` if run validity is `NO`

## Status model
Use this exact model.

### Dataset status
- `success`
- `fallback`
- `scraped`
- `cached`
- `failed`
- `missing`

### Engine status
- `READY`
- `DEGRADED`
- `SIMULATED`
- `SUPPRESSED`
- `FAILED`
- `WAITING`

Note:
- `SIMULATED` should only exist in explicit sandbox mode, not as an accidental production fallback.

## Sandbox mode rule
If you still need synthetic data during development, isolate it behind an explicit environment switch.

Example:
- `STEADYALPHA_SANDBOX_MODE=true`

Rules:
- UI must display `Sandbox Mode` prominently.
- run validity must always be `NO` for trading.
- paper promotion must be blocked unless explicitly testing promotion simulation.
- source registry must mark all synthetic inputs as `SIMULATED` or `MOCK`.

## Persistence model
Persist every dataset fetch attempt and result.

Recommended persisted fields:
- run id
- dataset key
- provider
- source type
- freshness
- criticality
- trading valid
- fetched at
- market date
- record count
- success/failure status
- warning/error
- cache used
- engine consumers

Also persist:
- run validity
- invalid reasons
- paper promotion allowed
- live trading allowed

## Retry and timeout policy
Each adapter should support:
- request timeout
- exponential backoff
- max retry count
- provider-specific headers/cookies/session handling
- circuit-breaker behavior if a provider repeatedly fails

### Suggested defaults
- timeout: 10–20 seconds
- retries: 2 or 3
- backoff: exponential with jitter
- fail fast for malformed payloads

## Observability requirements
Add logging and metrics for:
- fetch success rate by dataset/provider
- validation failure rate
- cache-hit rate
- scrape usage rate
- run invalidation reasons
- provider latency

This is necessary because your current problem is a data-plane problem, not a UI problem.

## Recommended build order
1. Remove random mock fallbacks from trading path.
2. Add source type and freshness separation.
3. Build adapter interface and result model.
4. Implement Nifty, VIX, FII/DII, options-chain adapters.
5. Add cache of last valid real snapshot.
6. Add validation and run-validity gating.
7. Add scraping fallback only where structured sources fail.
8. Persist provenance and invalid reasons.
9. Update diagnostics UI to reflect new source taxonomy.

## Example decision policy
If:
- Nifty = REAL/FRESH
- VIX = FALLBACK/FRESH
- FII = MISSING
- PCR = SCRAPED/FRESH
- Universe OHLCV = CACHED/STALE below threshold
- Equity = MISSING

Then:
- regime may be `DEGRADED`
- flows may be `DEGRADED` or `FAILED`
- leadership may be `FAILED`
- risk must be `FAILED`
- decision must be `INVALID_FOR_TRADING`
- paper promotion must be `DISABLED`

## Acceptance criteria
This architecture is acceptable only when:
- no random mock data enters trading logic,
- every critical dataset has a source ladder,
- cached last valid real data is available,
- scraping is isolated and validated,
- run validity is computed before promotion,
- and diagnostics clearly show real vs fallback vs scraped vs cached vs missing.

## Final recommendation
Do not patch the current issue source by source in ad hoc code.

Build a proper ingestion layer with adapters, validation, cache, provenance, and gating. Otherwise you will keep replacing one broken fetch with another fragile workaround.
