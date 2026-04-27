# SteadyAlpha — Engine Health + Decision Trace + Diagnostics Screen Spec

## Purpose
This screen is not a generic debug page. It is the operator-facing diagnostics surface for verifying that SteadyAlpha is running on real market data, that each engine computed correctly, and that the final decision is based on actual fetched inputs rather than mock or placeholder values.

The screen must help the user answer five questions immediately:
1. Did the pipeline run successfully?
2. What real data was fetched, from which source, and when?
3. Which engines computed successfully, degraded, or failed?
4. How did those engine outputs affect the final decision?
5. Was the decision based on real data, fallback data, stale data, or incomplete data?

This page is a trust page. Its job is to make the system auditable, inspectable, and believable.

## Screen goals
The page must:
- expose engine health clearly,
- show source-level data provenance,
- show freshness and fallback use,
- show decision trace across engines,
- distinguish missing vs stale vs suppressed vs failed states,
- and provide enough raw evidence that the user can verify the tool is working on real market data.

It must not:
- dump raw fields without interpretation,
- show `undefined` as a rendered user-facing state,
- hide source usage behind abstract labels,
- or blur the difference between computed neutrality and missing inputs.

## Screen structure
Render the page in this order:

1. Page header
2. Run summary strip
3. Data sources and fetch status section
4. Engine Health row
5. Decision Trace panel
6. Cross-engine impact panel
7. Diagnostics details accordions
8. Raw data evidence drawer

## Primary data sources for this page
The screen should combine data from these persisted outputs:
- `signals_summary` for regime, flows, leadership, advisor, risk, and final run timestamp.
- `pipeline_health` for run status, duration, and failure detail.
- `stock_scores` for leadership coverage and per-symbol scoring detail.
- `trade_requests` or future `paper_orders` / `paper_trades` for downstream paper-action visibility.
- run metadata persisted from the pipeline, including source freshness, fetch status, fallback status, and warnings.

## Real data visibility requirement
The user explicitly wants confidence that the tool is operating on real market data. Therefore the diagnostics screen must show, for every fetched dataset:
- dataset name,
- source provider,
- symbol or universe scope,
- fetch timestamp,
- market date represented,
- freshness state,
- whether it came from primary source or fallback source,
- row count or record count,
- and whether it was actually used in the engine output.

If any dataset is mocked, derived locally without fresh fetch, or fallback-cached, the UI must say so explicitly.

## Data fetched by the tool
Based on the current architecture and signal spec, the tool fetches or derives data from these external market data sources.

### Primary fetch sources
- `yfinance` for OHLCV time series used in index and stock calculations.
- `nsepython` for NSE-linked market data such as cash market and options data.
- NSE bhavcopy fallback for end-of-day market data when the primary source fails.

### Market datasets expected in the system
#### Index and volatility datasets
- Nifty 50 daily OHLCV.
- Bank Nifty daily OHLCV if used for divergence or confirmation.
- India VIX close series.
- Sector index OHLCV series for relative-strength comparisons.

#### Cash market flow datasets
- FII net cash market flows.
- DII net cash market flows.

#### Options datasets
- Put OI / Call OI totals for PCR OI.
- Strike-wise OI distribution for Max Pain.
- Spot price reference used against Max Pain.

#### Universe and leadership datasets
- F&O 200 or configured tradable universe from `config/universe.csv`.
- Daily OHLCV for each symbol in the active universe.
- Volume series for volume ratio.
- 50-DMA and relative strength inputs derived from historical daily price data.
- Optional earnings blackout reference if implemented.

#### Delivery and participation datasets
- NSE delivery percentage data.

#### System datasets
- Previous regime state from persisted history.
- Transition-day count from persisted history.
- Current equity / drawdown state for the risk engine.
- Consecutive losing days from persisted trade history.

## Source registry model
Implement a source registry object persisted per run.

```ts
type SourceRegistryItem = {
  datasetKey: string;
  datasetLabel: string;
  provider: 'yfinance' | 'nsepython' | 'nse_bhavcopy' | 'supabase_history' | 'config_file' | 'derived';
  category: 'index' | 'volatility' | 'cash_flows' | 'options' | 'sector' | 'universe' | 'risk_state' | 'history';
  scope: string;
  marketDate: string | null;
  fetchedAt: string | null;
  freshness: 'FRESH' | 'STALE' | 'FALLBACK' | 'MISSING';
  sourcePriority: number;
  wasUsed: boolean;
  recordCount: number | null;
  warning: string | null;
  error: string | null;
};
```

Persist an array of these items in either a dedicated diagnostics table or an `engine_audit` / run metadata JSON structure.

## Page header
### Component: `DiagnosticsHeader`
Fields:
- Page title: `Engine Health + Decision Trace`
- Run timestamp
- Run ID
- Pipeline duration
- Back-to-console action

Visible copy example:
- `Run: 27 Apr 2026, 6:15 PM`
- `Run ID: 0c0679a8-f72c-470b-9cf4-deb9735ade26`
- `Duration: 8.2 sec`

## Run summary strip
### Component: `RunSummaryStrip`
Show high-level badges:
- Pipeline Status: `SUCCESS` / `PARTIAL` / `FAILED`
- Data Integrity: `FULL` / `DEGRADED` / `INCOMPLETE`
- Decision Basis: `REAL DATA` / `REAL + FALLBACK` / `PARTIAL DATA` / `INSUFFICIENT DATA`
- Operating Mode: `SIGNAL_ONLY` / `PAPER` / `ASSISTED_LIVE` / `LIVE_AUTO`
- Final Decision: `NO_TRADE` / `WATCHLIST` / `LONG_BIAS` / `SHORT_BIAS` / `PAPER_ELIGIBLE`

This strip should tell the user in one line whether the system can be trusted for this run.

## Data sources section
### Component: `DataSourcesPanel`
This is mandatory. It is the proof surface that the tool used real data.

Show a table with these columns:

| Column | Meaning |
|---|---|
| Dataset | Name of data used by engine |
| Provider | yfinance / nsepython / nse_bhavcopy / history / config |
| Scope | NIFTY / India VIX / F&O 200 / option chain / sector indices |
| Market Date | Date represented by data |
| Fetched At | Actual fetch time |
| Freshness | FRESH / STALE / FALLBACK / MISSING |
| Records | Row or record count |
| Used In | Regime / Flows / Leadership / Risk / Advisor |
| Status | loaded / fallback / failed / skipped |
| Note | warning or reason |

### Required datasets to list
The UI must list at least these datasets if the tool is configured to fetch them:
- Nifty 50 OHLCV
- Bank Nifty OHLCV if used
- India VIX series
- Sector indices series
- FII cash flows
- DII cash flows
- PCR OI
- Max Pain OI distribution
- Delivery data
- Active stock universe
- Universe OHLCV batch
- Previous run history
- Account equity / trade history inputs used for risk

### Status semantics
Use exact statuses:
- `loaded` = fetched and used successfully
- `fallback` = primary failed, fallback used
- `skipped` = not needed for this run
- `failed` = expected but unavailable
- `cached` = loaded from trusted prior persisted snapshot, not refetched now

Do not show raw nulls or `undefined`.

## Engine Health row
Render five cards in a row or responsive grid:
- Regime Engine
- Flows Engine
- Leadership Engine
- Risk Engine
- Decision Engine

Each card must use the same internal structure.

### Shared card structure
1. Status badge: `READY`, `DEGRADED`, `SUPPRESSED`, `WAITING`, `FAILED`
2. Primary output
3. Dependency summary
4. Downstream impact
5. Expand for raw metrics

### Component contract
```ts
type EngineCardState = {
  engine: 'REGIME' | 'FLOWS' | 'LEADERSHIP' | 'RISK' | 'DECISION';
  status: 'READY' | 'DEGRADED' | 'SUPPRESSED' | 'WAITING' | 'FAILED';
  primaryOutput: string[];
  dependencySummary: string[];
  downstreamImpact: string[];
  warnings: string[];
  rawMetrics: Record<string, string | number | boolean | null>;
};
```

## Regime Engine card
### Primary output
Show:
- Regime state
- Regime confidence
- Hysteresis state
- Trend score
- ADX
- Breadth %
- VIX percentile

### Dependency summary
Show whether these inputs were available and fresh:
- index price series
- VIX
- breadth universe
- previous regime state

### Downstream impact examples
- `Regime vote contributed LONG bias`
- `Confidence capped due to missing breadth`
- `Hysteresis blocked regime flip`
- `High VIX override active`

## Flows Engine card
### Primary output
Show:
- Bias
- Flow score
- FII 5D net
n- DII 5D net
- PCR OI
- Max Pain relation
- Sector alignment result

### Dependency summary
Show source health for:
- cash flow feed
- option chain feed
- sector index feed
- delivery feed

### Downstream impact examples
- `Flow vote suppressed due to stale options data`
- `Bullish flow contributed to advisor`
- `Neutral flow because only cash flow feed loaded`

## Leadership Engine card
### Primary output
Show:
- Universe coverage: actual / expected
- Qualified leaders count
- Qualified laggards count
- Top leaders summary
- Top laggards summary

### Dependency summary
Show:
- universe file loaded
- stock OHLCV batch status
- volume history availability
- blackout filter availability

### Downstream impact examples
- `Leadership vote disabled: coverage below threshold`
- `Top 5 leaders available and used`
- `Leadership suppressed in no-trade decision`

## Risk Engine card
### Primary output
Show:
- Risk mode
- Base risk %
- Current drawdown %
- Drawdown limit %
- Position size or size multiplier
- Consecutive loss days

### Dependency summary
Show:
- equity state loaded
- trade history loaded
- ATR computed

### Downstream impact examples
- `Risk gate passed`
- `Size reduced due to drawdown`
- `Trading halted by circuit breaker`

## Decision Engine card
### Purpose
This is the decision-trace card, not a vague AI summary.

### Primary output
Show:
- Final decision
- Confidence %
- Agreement count if used
- Conflict status
- Included votes vs suppressed votes

### Gate row
Show four badges:
- Regime Gate
- Flow Gate
- Leadership Gate
- Risk Gate

### Downstream impact examples
- `No-trade due to range-bound regime`
- `Bullish flow not sufficient without regime confirmation`
- `Decision based on real data plus fallback VIX feed`

## Cross-engine impact panel
### Component: `DecisionTracePanel`
This panel explains how each engine affected the final outcome.

Use a table like this:

| Engine | Status | Vote / Gate | Confidence Impact | Note |
|---|---|---|---|---|
| Regime | READY | FAIL | -0.30 | Range-bound regime blocked directional setup |
| Flows | READY | PASS | +0.20 | Bullish cash and PCR contribution |
| Leadership | DEGRADED | FAIL | 0.00 | Universe coverage too low |
| Risk | READY | PASS | 0.00 | Risk mode ACTIVE |

This is the most important transformation from the current field dump. It shows the causal chain.

## Diagnostics details accordions
Render collapsible sections below the main decision trace.

### Accordion 1: Source freshness and provenance
Show all `SourceRegistryItem` rows.

### Accordion 2: Engine raw metrics
Show formatted raw key-value metrics by engine.
Do not show empty keys or untyped null states.

### Accordion 3: Warnings and suppressions
Show:
- missing inputs,
- stale inputs,
- fallback use,
- engine suppression reasons,
- confidence caps,
- eligibility blocks.

### Accordion 4: Validation results
Show pass/fail checks such as:
- confidence within valid range
- leadership coverage threshold met
- required flow datasets available
- no directional trade when risk halted
- no paper promotion when final decision is no-trade

## Raw data evidence drawer
### Component: `RawDataEvidenceDrawer`
This is the proof panel that the system is working on actual data.

Show small preview samples of fetched data with timestamps, for example:
- latest 3 rows of Nifty OHLCV
- latest India VIX close
- latest 5-day FII/DII flow values
- current PCR and max pain snapshot
- sample of top 5 stock scores

For each preview, include:
- source provider
- fetch timestamp
- market date
- record count
- whether used in the run

This drawer should be optional but easy to open.

## Missing-data rendering rules
Never render `undefined`, `{}`, `[]`, or `null` directly.

Map them to typed states:
- `Not fetched`
- `Fetch failed`
- `Fallback used`
- `Suppressed`
- `Not applicable`
- `Waiting for minimum history`
- `Coverage below threshold`

## Freshness rules
Each fetched dataset and each engine must carry freshness state.

### Freshness enum
- `FRESH`
- `STALE`
- `FALLBACK`
- `MISSING`

### Example rules
- Intraday market data older than threshold during market hours => `STALE`
- Primary source failed, bhavcopy loaded => `FALLBACK`
- Dataset absent => `MISSING`
- Same-day successful fetch => `FRESH`

## Status color rules
- READY / FRESH / SUCCESS => green
- DEGRADED / FALLBACK / PARTIAL / WAITING => amber
- FAILED / MISSING / HALTED => red
- SUPPRESSED => grey

## Frontend view model
```ts
type DiagnosticsScreenViewModel = {
  runId: string;
  runTs: string;
  durationSec: number | null;
  pipelineStatus: 'SUCCESS' | 'PARTIAL' | 'FAILED';
  dataIntegrity: 'FULL' | 'DEGRADED' | 'INCOMPLETE';
  decisionBasis: 'REAL_DATA' | 'REAL_PLUS_FALLBACK' | 'PARTIAL_DATA' | 'INSUFFICIENT_DATA';
  operatingMode: 'SIGNAL_ONLY' | 'PAPER' | 'ASSISTED_LIVE' | 'LIVE_AUTO';
  finalDecision: string;
  sourceRegistry: SourceRegistryItem[];
  engines: EngineCardState[];
  decisionTrace: {
    engine: string;
    status: string;
    gateOrVote: string;
    confidenceImpact: number;
    note: string;
  }[];
  warnings: string[];
  validationChecks: {
    label: string;
    result: 'PASS' | 'FAIL' | 'WARN';
    note?: string;
  }[];
  rawDataPreview: {
    datasetKey: string;
    provider: string;
    fetchedAt: string | null;
    marketDate: string | null;
    rows: any[];
  }[];
};
```

## Backend requirements
To support this screen, the pipeline must persist more than final summaries.

### Persist per-run source metadata
Store:
- provider name
- fetch status
- timestamps
- record counts
- fallback indicator
- usage flag
- warnings and errors

### Persist per-engine diagnostics
Store:
- status
- dependencies available / missing
- raw key metrics
- downstream effect on decision
- suppression reason if any

### Persist validation checks
Store machine-readable pass/fail checks for:
- missing critical datasets
- low universe coverage
- stale options data
- confidence formatting validity
- no-trade gate consistency

## Acceptance criteria
The screen is complete only when:
- the user can verify that each decision used real fetched market data,
- the page clearly shows primary versus fallback data,
- no `undefined` or raw null-like values appear,
- each engine has a typed status,
- the final decision can be traced back across engines,
- and the user can inspect raw evidence without leaving the screen.

## Immediate implementation order
1. Add source registry persistence in the pipeline.
2. Add engine diagnostics persistence per run.
3. Add validation check persistence.
4. Build `RunSummaryStrip`.
5. Build `DataSourcesPanel`.
6. Refactor engine cards to typed statuses.
7. Build `DecisionTracePanel`.
8. Add raw data evidence drawer.
9. Remove raw `undefined` / null rendering from UI.

## Strong recommendation
Do not ship this screen as another pretty dashboard. Treat it as a trust instrument.

If the user cannot verify real data provenance and decision causality here, the rest of the product will always feel like a black box.
