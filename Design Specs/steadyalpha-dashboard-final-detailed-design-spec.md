# SteadyAlpha Dashboard — Final Detailed Design Spec

## Purpose
This document is the developer-ready design spec for the SteadyAlpha Console dashboard after the latest UI iteration review.

The goal is to move the screen from “usable layout” to “operationally trustworthy trading console.”

This spec focuses on:
- semantic consistency,
- decision clarity,
- engine traceability,
- diagnostics completeness,
- and real-data trust visibility.

## Design status
Current state: acceptable layout, incomplete semantics.

The dashboard is good enough to stop broad layout iteration and move into correctness hardening. However, it is not complete enough to declare final sign-off.

## Completion criteria
The dashboard should only be considered complete when all of the following are true:
- top status strip is semantically consistent,
- decision labels map to real operational states,
- engine summaries do not contradict detailed content,
- paper-action empty states explain causality,
- diagnostics expose real data provenance,
- and the user can verify whether the run is based on real, fallback, stale, or incomplete data.

## Final punch list
These are the 10 issues to close before sign-off.

### 1. Resolve top-strip status ambiguity
Current problem:
- `Data: FRESH` is shown while `System: DEGRADED` is also shown.

Required change:
- Add `Degraded Reason` beside system status or as a tooltip/chip.

Accepted examples:
- `System: DEGRADED — sector alignment unavailable`
- `System: DEGRADED — leadership coverage insufficient`
- `System: DEGRADED — fallback data used for VIX`

### 2. Replace operationally vague decision labels
Current problem:
- `Decision: NEUTRAL` is too analytical and not clearly actionable.

Required change:
- Use one of these end-user decision labels only:
  - `NO_TRADE`
  - `WATCHLIST`
  - `LONG_BIAS`
  - `SHORT_BIAS`
  - `PAPER_ELIGIBLE`

Mapping rule:
- If confidence is too low or gates fail, render `NO_TRADE` or `WATCHLIST`, not `NEUTRAL`.

### 3. Fix Leadership card contradictions
Current problem:
- Leadership summary says leaders exist, but detailed display shows `None`.

Required change:
- If `leaders_count > 0`, render actual leader rows.
- If leaders are not shown because of suppression, filtering, or truncation, show explicit reason.

Allowed empty-state reasons:
- `No qualified leaders after liquidity filter`
- `Leaders suppressed in no-trade state`
- `Leaders available only in diagnostics view`

### 4. Add typed engine status to every engine card
Current problem:
- Cards show data but not explicit engine health.

Required change:
- Every engine card must show one status badge:
  - `READY`
  - `DEGRADED`
  - `SUPPRESSED`
  - `WAITING`
  - `FAILED`

Rendering rule:
- Status must be visible in the card header, not hidden in diagnostics.

### 5. Add dependency and impact lines to every engine card
Current problem:
- Users can see outputs but not why an engine is degraded or how it affected the decision.

Required change:
- Each card must include:
  - `Dependencies:` one short line
  - `Impact:` one short line

Examples:
- `Dependencies: options data stale; sector feed loaded`
- `Impact: flow vote suppressed`
- `Dependencies: universe OHLCV complete`
- `Impact: leadership contributed no qualifying setups`

### 6. Upgrade Diagnostics Drawer from metadata to diagnostics
Current problem:
- Drawer shows only run metadata, which is not enough.

Required change:
- Drawer must include at minimum:
  - Run ID
  - Duration
  - Pipeline Version
  - Source provenance table
  - Validation checks
  - Engine warnings / suppressions
  - Optional raw data previews

The current drawer is metadata-only and should not be labeled diagnostics until this is implemented.

### 7. Add real-data provenance panel
Current problem:
- User cannot verify whether the run used real fetched market data.

Required change:
- Add a `Data Sources` section or diagnostics subsection with these columns:
  - Dataset
  - Provider
  - Scope
  - Market Date
  - Fetched At
  - Freshness
  - Records
  - Used In
  - Status
  - Note

Required datasets to expose when relevant:
- Nifty 50 OHLCV
- Bank Nifty OHLCV if used
- India VIX
- FII flows
- DII flows
- PCR OI
- Max Pain
- Sector indices
- Universe OHLCV batch
- Delivery data
- Previous run history
- Risk-state history inputs

### 8. Improve paper-action empty states
Current problem:
- `No paper actions this run` is incomplete.

Required change:
- Replace with cause-aware empty-state copy.

Allowed examples:
- `No paper actions — no setups qualified`
- `No paper actions — final decision was NO_TRADE`
- `No paper actions — paper mode inactive`
- `No paper actions — risk gate blocked promotion`

### 9. Add validation checks to the UI
Current problem:
- Important trust checks are not visible.

Required change:
- Add a validation list with pass/fail/warn states for:
  - confidence within 0–100
  - leadership coverage threshold met
  - required flow datasets available
  - no trade promotion when risk halted
  - no directional action when regime is blocked
  - fallback usage explicitly marked

### 10. Add raw evidence access
Current problem:
- User cannot inspect actual fetched rows or snapshots.

Required change:
- Add a `Raw Data Evidence` drawer or accordion with small previews of:
  - recent Nifty OHLCV rows
  - current VIX snapshot
  - recent FII/DII values
  - current PCR / max pain values
  - top stock scores

This is required if the product is expected to feel trustworthy and non-mock.

## Page layout
Use this exact structure.

1. Global top strip
2. Console title row
3. Engine summary cards
4. Decision Engine panel
5. State changes panel
6. Paper actions section
7. Diagnostics drawer
8. Raw data evidence drawer

## Global top strip
### Fields
- `System`
- `Mode`
- `Data`
- `Risk`
- `Last Success`
- `Degraded Reason` if system is degraded

### Status rules
- `System` values: `HEALTHY`, `DEGRADED`, `FAILED`
- `Mode` values: `SIGNAL_ONLY`, `PAPER`, `ASSISTED_LIVE`, `LIVE_AUTO`
- `Data` values: `FRESH`, `STALE`, `FALLBACK`, `MISSING`
- `Risk` values: `ACTIVE`, `REDUCED`, `HALTED`

### Behavior rules
- If `System = DEGRADED`, the UI must expose why.
- If `Data = FALLBACK`, the UI must expose which dataset used fallback.
- If `Risk = HALTED`, the dashboard must suppress paper promotion labels.

## Console title row
### Fields
- Page title: `SteadyAlpha Console`
- Optional action: `View Engine Diagnostics`
- Stage label if used: `Stage 2 — Automated Paper Execution`

### Rule
The stage label should not be more prominent than the operational state.

## Engine summary cards
Render four cards in a row:
- Regime Engine
- Flows Engine
- Leadership Engine
- Risk Engine

### Shared card structure
Each card must contain:
- header title
- status badge
- 4–6 primary metrics
- one dependency line
- one impact line
- optional warning chip

## Regime Engine card
### Required fields
- Regime
- Confidence
- Trend Score
- ADX
- VIX percentile
- Breadth
- Hysteresis
- Status

### Derived messages
Examples:
- `Impact: blocked directional setup`
- `Impact: regime vote contributed SHORT_BIAS`
- `Dependencies: breadth loaded; VIX fallback used`

## Flows Engine card
### Required fields
- Bias
- Flow score
- FII 5D Net
- DII 5D Net
- PCR OI
- Max Pain relation
- Sector alignment
- Status

### Derived messages
Examples:
- `Dependencies: cash flow feed loaded; options feed stale`
- `Impact: bullish flow vote weakened`

## Leadership Engine card
### Required fields
- Coverage actual / expected
- Qualified leaders count
- Qualified laggards count
- Top leaders preview
- Top laggards preview
- Status
- Reason

### Rules
- If count > 0, do not render `None`.
- If preview is hidden, show explicit reason.

## Risk Engine card
### Required fields
- Risk mode
- Base risk
- Current drawdown
- Drawdown limit
- Position size multiplier if used
- Consecutive loss days if used
- Status

### Derived messages
Examples:
- `Impact: risk gate pass`
- `Impact: size reduced due to drawdown`

## Decision Engine panel
### Header
- `Decision Engine`
- final decision label
- calibrated confidence percent

### Gate row
Show these four gate chips:
- Regime Gate
- Flow Gate
- Leadership Gate
- Risk Gate

### Reasons block
Show at most 3 bullet reasons.

### Conflict block
Show only when conflicts exist.

### Rendering rules
- `NO_TRADE` should be amber, not error red.
- Confidence under threshold should grey out directional emphasis.
- If all gates fail, suppress positive styling.

## State changes panel
### Purpose
Summarize only material changes since previous run.

### Fields
- since timestamp
- list of material changes

### Copy rules
Use one of:
- `No material changes since last run`
- or a short list such as:
  - `Flow bias changed from NEUTRAL to BULLISH`
  - `Leadership coverage improved from 140 to 198`

Do not show noisy metric drift.

## Paper actions section
### Title
Use `Paper Actions` or `Paper Orders` consistently.

### Empty state rules
Use cause-aware empty states only.

### If rows exist, columns must be
- Symbol
- Setup
- Dir
- Action
- Conf
- Qty
- Risk
- Source
- Reason
- Time

### Rules
- Do not show raw UUID as primary visible value.
- Show full IDs only in row expansion or copy action.
- Every paper action must explain its source and gating result.

## Diagnostics drawer
### Title
`Diagnostics Drawer`

### Minimum sections
1. Run metadata
2. Source provenance
3. Validation checks
4. Engine warnings
5. Raw metric details

### Run metadata fields
- Run ID
- Duration
- Pipeline Version
- Trigger Type if available

## Source provenance section
### Purpose
Prove that real data was fetched and used.

### Columns
- Dataset
- Provider
- Scope
- Market Date
- Fetched At
- Freshness
- Record Count
- Used In
- Status
- Note

### Status values
- `loaded`
- `fallback`
- `failed`
- `cached`
- `skipped`

### Freshness values
- `FRESH`
- `STALE`
- `FALLBACK`
- `MISSING`

## Validation checks section
### Required checks
- confidence formatting valid
- engine statuses typed
- leadership coverage threshold satisfied
- required datasets present
- fallback source flagged
- no paper action when final decision blocks promotion
- no paper action when risk halted

### Output type
Each check should show:
- label
- result: `PASS`, `FAIL`, or `WARN`
- short note

## Raw metric details section
### Purpose
Support deeper debugging without cluttering the main screen.

### Rules
- show engine-level raw metrics in collapsed panels,
- hide null-like values unless mapped to typed reasons,
- never render literal `undefined`, `{}`, or `[]` as user-facing content.

## Raw data evidence drawer
### Purpose
Expose small previews of actual fetched records.

### Minimum preview datasets
- Nifty OHLCV latest rows
- India VIX latest value
- FII/DII recent flow values
- PCR / Max Pain snapshot
- sample universe stock scores

### Preview fields
- dataset label
- provider
- fetched timestamp
- market date
- record count
- small preview table
- used in run: yes/no

## Data model additions required
The dashboard is not truthful enough without persisted diagnostics data.

### Required tables or persisted structures
- `run_registry`
- `source_registry`
- `engine_diagnostics`
- `validation_checks`
- `raw_data_previews`

These should support the diagnostics UI directly rather than forcing the frontend to infer everything from `signals_summary`.

## Frontend view model
```ts
type DashboardDiagnosticsVM = {
  systemStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  operatingMode: 'SIGNAL_ONLY' | 'PAPER' | 'ASSISTED_LIVE' | 'LIVE_AUTO';
  dataFreshness: 'FRESH' | 'STALE' | 'FALLBACK' | 'MISSING';
  riskMode: 'ACTIVE' | 'REDUCED' | 'HALTED';
  degradedReason?: string | null;
  lastSuccessTs: string;
  runId: string;
  pipelineVersion: string;
  durationMs: number;
  regime: any;
  flows: any;
  leadership: any;
  risk: any;
  decision: any;
  stateChanges: string[];
  paperActions: any[];
  sourceRegistry: any[];
  validationChecks: any[];
  engineDiagnostics: any[];
  rawDataPreviews: any[];
};
```

## Acceptance criteria
The dashboard is ready for sign-off only when:
- every visible state has typed semantics,
- decision labels are operational rather than analytical-only,
- no engine card contradicts itself,
- diagnostics prove real data provenance,
- empty states explain causality,
- and the user can audit a run without guessing.

## Implementation sequence
1. Add diagnostics persistence support in backend.
2. Add degraded reason to top strip.
3. Normalize decision labels.
4. Fix leadership rendering consistency.
5. Add engine status, dependency, and impact lines.
6. Expand diagnostics drawer sections.
7. Add provenance and validation panels.
8. Add raw data evidence drawer.
9. Final semantic QA pass.

## Final recommendation
Do not spend more time on cosmetic polish until these semantic and diagnostics issues are closed.

The layout is already good enough. Trust, causality, and real-data visibility are the remaining blockers.
