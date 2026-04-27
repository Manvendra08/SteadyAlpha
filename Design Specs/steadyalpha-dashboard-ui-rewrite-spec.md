# SteadyAlpha Dashboard UI Rewrite Spec

## Screen contract

This page is the operator console for one run snapshot plus current paper-action state. It should render from one primary `signals_summary` record, one `pipeline_health` record, and a small recent paper-actions query.

The page must not force the user to infer state from scattered numbers; every major system condition should be explicit.

## Page structure

Render the page in this order:

1. Status bar
2. Top-row state cards
3. Decision panel
4. Changes panel
5. Paper actions table
6. Expandable diagnostics drawer

That order mirrors actual usage: assess state, read decision, inspect what changed, then inspect what the system did.

## Data contract

### Primary sources
Use these inputs:

- `signals_summary` for regime, flows, leadership, advisor, risk, and run timestamp.
- `pipeline_health` for pipeline status, duration, and failure details.
- `paper_orders` or current equivalent order table for recent paper actions.
- Optional historical prior `signals_summary` row for “changes since last run.”

### Required frontend-normalized shape
Use a normalized object like this:

```ts
type DashboardViewModel = {
  systemStatus: 'HEALTHY' | 'DEGRADED' | 'FAILED';
  operatingMode: 'SIGNAL_ONLY' | 'PAPER' | 'ASSISTED_LIVE' | 'LIVE_AUTO';
  lastSuccessTs: string;
  dataFreshness: 'FRESH' | 'STALE' | 'FALLBACK' | 'MISSING';
  riskMode: 'ACTIVE' | 'REDUCED' | 'HALTED';

  regime: {
    state: 'TREND_UP' | 'TREND_DOWN' | 'RANGE_BOUND' | 'TRANSITION' | 'HIGH_VIX';
    confidencePct: number;
    trendScore: number;
    adx: number;
    vix: number;
    vixPercentile: number;
    breadthPct: number;
    hysteresisState: 'CONFIRMED' | 'WAITING';
  };

  flows: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    fii5dNet: number | null;
    dii5dNet: number | null;
    pcrOi: number | null;
    maxPain: number | null;
    spotVsMaxPainPct: number | null;
    sectorAlignment: 'ALIGNED' | 'CONFLICTED' | 'NEUTRAL' | 'UNKNOWN';
    freshness: 'FRESH' | 'STALE' | 'FALLBACK' | 'MISSING';
    biasDrivers: string[];
  };

  leadership: {
    status: 'READY' | 'WAITING_FOR_BATCH' | 'COVERAGE_TOO_LOW' | 'SUPPRESSED' | 'DATA_MISSING';
    universeCoverage: number | null;
    qualifiedLeaderCount: number;
    qualifiedLaggardCount: number;
    leaders: { symbol: string; score: number; sector?: string }[];
    laggards: { symbol: string; score: number; sector?: string }[];
    statusReason: string;
  };

  risk: {
    mode: 'ACTIVE' | 'REDUCED' | 'HALTED';
    baseRiskPct: number;
    drawdownPct: number;
    drawdownLimitPct: number;
    positionSize?: number | null;
    triggerReason?: string | null;
  };

  decision: {
    label: 'NO_TRADE' | 'WATCHLIST' | 'LONG_BIAS' | 'SHORT_BIAS' | 'PAPER_ELIGIBLE';
    confidencePct: number;
    regimeGate: 'PASS' | 'FAIL';
    flowGate: 'PASS' | 'FAIL';
    leadershipGate: 'PASS' | 'FAIL';
    riskGate: 'PASS' | 'FAIL';
    reasons: string[];
    conflicts: string[];
  };

  changes: {
    material: boolean;
    items: string[];
    asOfTs: string;
  };

  paperActions: {
    symbol: string;
    setupType: string;
    direction: 'LONG' | 'SHORT';
    decision: 'OPENED' | 'REJECTED' | 'SKIPPED' | 'CLOSED' | 'PENDING';
    confidencePct: number | null;
    qty: number | null;
    riskGate: 'PASS' | 'FAIL' | 'N/A';
    source: 'DECISION_ENGINE' | 'MANUAL' | 'BROKER_RETRY';
    reason: string;
    ts: string;
    rawId: string;
  }[];
};
```

## Status bar

### Component: `SystemStatusBar`
Show these fields left to right:

- System Status badge
- Operating Mode badge
- Data Freshness badge
- Risk Mode badge
- Last Successful Run timestamp

### Copy rules
Use exact visible strings:

- `System: HEALTHY`
- `Mode: PAPER`
- `Data: FRESH`
- `Risk: REDUCED`
- `Last success: 27 Apr 2026, 5:30 PM`

### Color rules
- HEALTHY, ACTIVE, FRESH: green
- DEGRADED, REDUCED, FALLBACK, STALE: amber
- FAILED, HALTED, MISSING: red
- SIGNAL_ONLY: blue-grey; PAPER: amber; ASSISTED_LIVE: blue; LIVE_AUTO: red-amber mix

## Top cards

### Component: `RegimeCard`
Fields:
- State label
- Confidence percent
- Trend score, ADX, breadth, VIX percentile
- Hysteresis badge

Visible copy examples:
- `Regime: RANGE_BOUND`
- `Confidence: 60%`
- `Hysteresis: WAITING`

Do not use just `RANGE` if backend enum is `RANGE_BOUND`; be consistent.

### Component: `FlowsCard`
Fields:
- Bias label
- FII 5D, DII 5D, PCR OI, max pain relation
- Freshness badge
- 2–3 bias drivers

Visible copy examples:
- `Bias: BULLISH`
- `Drivers: FII inflow strong; PCR supportive; sector alignment mixed`

### Component: `LeadershipCard`
Fields:
- Status badge
- Universe coverage
- Qualified leaders count
- Qualified laggards count
- Top 3 leaders and top 3 laggards
- Explicit status reason

Visible copy examples:
- `Status: SUPPRESSED`
- `Reason: No-trade regime; leadership not promoted`
- `Coverage: 198/200`

Never show only `No data yet`.

### Component: `RiskCard`
Fields:
- Risk mode badge
- Base risk %
- Current drawdown %
- Drawdown limit %
- Trigger reason if reduced or halted

Visible copy examples:
- `Mode: REDUCED`
- `Trigger: Drawdown above 1%`

## Decision panel

### Component: `DecisionPanel`
Rename from AI Advisor to `Decision Engine`.

Fields:
- Decision label
- Confidence percent
- Four gate badges: regime, flow, leadership, risk
- Max 3 reasons
- Conflict list if non-empty

Visible structure:
- Header: `Decision: NO_TRADE`
- Subheader: `Confidence: 45%`
- Gates row: `Regime FAIL | Flow PASS | Leadership FAIL | Risk PASS`
- Reasons:
  - `Range-bound regime lacks directional conviction`
  - `Bullish flow exists but regime not confirmed`
  - `Waiting for hysteresis confirmation`

### Render rules
- If confidence < 50%, grey the confidence bar and do not use green directional emphasis.
- If decision is `NO_TRADE`, use amber, not red. No-trade is not an error.

## Changes panel

### Component: `ChangesPanel`
This should summarize only material changes since previous run.

Fields:
- `material` boolean
- `items[]`
- comparison timestamp

Visible copy:
- `No material changes since last run`
or
- `Regime changed from TRANSITION to RANGE_BOUND`
- `Flow bias strengthened from NEUTRAL to BULLISH`
- `2 leaders removed; 1 leader added`

Do not show noise-level changes as if they matter.

## Paper actions table

### Component: `PaperActionsTable`
Use these columns:

| Column | UI label |
|---|---|
| `symbol` | Symbol |
| `setupType` | Setup |
| `direction` | Dir |
| `decision` | Action |
| `confidencePct` | Conf |
| `qty` | Qty |
| `riskGate` | Risk |
| `source` | Source |
| `reason` | Reason |
| `ts` | Time |

Hide `rawId` in collapsed view; show it in row details only.

### Row examples
- `NIFTY | Regime-flow breakout | LONG | REJECTED | 45% | 0 | PASS | DECISION_ENGINE | advisor_no_trade | 5:07 PM`
- `RELIANCE | Q5 leader aligned | LONG | OPENED | 72% | 4 | PASS | DECISION_ENGINE | all gates passed | 1:30 PM`

### Row color states
- OPENED: green
- PENDING: blue-grey
- REJECTED: red
- SKIPPED: grey
- CLOSED: neutral with P&L chip if available

### Empty state copy
- `No paper actions this run`
- `No setups qualified for paper promotion`
- `Paper mode inactive`

## Diagnostics drawer

### Component: `DiagnosticsDrawer`
Collapsed by default.

Sections:
- Source freshness map
- Raw gate values
- Rejection logs
- Run metadata: run_id, duration, pipeline version

This keeps the main UI clean while still supporting forensic inspection.

## Enums and copy

Use these enums consistently across frontend and backend:

- Regime: `TREND_UP`, `TREND_DOWN`, `RANGE_BOUND`, `TRANSITION`, `HIGH_VIX`
- Bias: `BULLISH`, `BEARISH`, `NEUTRAL`
- Risk mode: `ACTIVE`, `REDUCED`, `HALTED`
- Decision: `NO_TRADE`, `WATCHLIST`, `LONG_BIAS`, `SHORT_BIAS`, `PAPER_ELIGIBLE`
- Operating mode: `SIGNAL_ONLY`, `PAPER`, `ASSISTED_LIVE`, `LIVE_AUTO`

Do not mix backend names and UI shorthand casually.

## Validation rules

Add frontend assertions for these immediately:

- Confidence values must be between 0 and 100 after formatting.
- If regime is `RANGE_BOUND` and decision is directional, show explicit warning unless override exists.
- If leadership status is not `READY`, leaders list must not render as empty without reason.
- If risk mode is `HALTED`, action cannot render as `OPENED`.
- If system status is `FAILED`, last snapshot must be marked stale.

These would have caught the 4500% bug and current ambiguity.

## Immediate implementation order

Do this in order:

1. Normalize the view model and confidence scaling.
2. Replace header with explicit status badges.
3. Rewrite top cards with clear status reasons.
4. Replace AI Advisor panel with Decision Engine + gate row.
5. Replace paper orders table columns and hide raw IDs.
6. Add diagnostics drawer.

This is the shortest path to a screen that looks less impressive but is much more trustworthy.
