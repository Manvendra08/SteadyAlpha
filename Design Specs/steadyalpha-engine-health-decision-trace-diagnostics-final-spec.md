# SteadyAlpha Diagnostics & Sign-Off Change Request

## Purpose
This document defines the exact changes required before the SteadyAlpha diagnostics and dashboard implementation can be signed off as trading-grade rather than just development-grade.

It also includes higher-leverage product and UX suggestions that go beyond the current spec and materially improve operator trust, decision speed, and production readiness.

## Sign-off status
Current status: **conditional hold**.

The current implementation is structurally strong and materially improved, but it is not ready for final sign-off because status semantics, trading-validity gating, and mock-vs-real data classification are still too weak.

## Core sign-off principle
A diagnostics page must not merely look transparent. It must classify truth correctly.

If the system is using mock, hardcoded, missing, or disconnected inputs, the UI must make that impossible to misread.

## Exact changes required for sign-off

### 1. Add top-level run-validity status
Add a prominent top-strip badge:
- `Run Valid for Trading: YES`
- `Run Valid for Trading: NO`
- `Run Valid for Trading: PARTIAL`

### Required logic
Set `Run Valid for Trading = NO` when any critical dataset for decisioning or risk is:
- mock,
- hardcoded,
- disconnected,
- missing,
- or stale beyond allowed threshold.

Set `PARTIAL` only when:
- the run is useful for diagnostics,
- but not eligible for paper promotion or live trading.

### Reason display
When not valid, show explicit reasons inline, for example:
- `Trading invalid: NSE option-chain feed disconnected`
- `Trading invalid: equity curve is simulated`
- `Trading invalid: leadership universe is mock`

## 2. Replace current engine status model
The current statuses are too optimistic.

### New required engine statuses
Use these only:
- `READY`
- `DEGRADED`
- `SIMULATED`
- `SUPPRESSED`
- `FAILED`
- `WAITING`

### Rules
- `READY`: all critical dependencies real and within freshness threshold.
- `DEGRADED`: real data present, but fallback or non-critical degradation exists.
- `SIMULATED`: any critical input is mock, random, hardcoded, or synthetic.
- `SUPPRESSED`: engine intentionally excluded from voting or promotion.
- `FAILED`: engine could not compute required output.
- `WAITING`: insufficient history or pending first valid run.

### Mandatory replacement rule
Do not allow `READY` if any critical dependency is mock or disconnected.

## 3. Upgrade decision state semantics
The decision label must represent what the operator should do, not what the model feels.

### Allowed decision labels
- `NO_TRADE`
- `WATCHLIST`
- `LONG_BIAS`
- `SHORT_BIAS`
- `PAPER_ELIGIBLE`
- `INVALID_FOR_TRADING`

### Mapping rules
- If critical data validity fails, decision must be `INVALID_FOR_TRADING`.
- If data is valid but no action qualifies, decision must be `NO_TRADE`.
- `NEUTRAL` should not be shown as the top-level operator decision.

## 4. Separate source type from freshness
The current screen mixes fallback, mock, and freshness semantics too loosely.

### Required fields per dataset
Every fetched or referenced dataset must show:
- `source_type`: `REAL`, `FALLBACK`, `MOCK`, `HISTORY`, `CONFIG`, `DERIVED`
- `freshness`: `FRESH`, `STALE`, `MISSING`
- `trading_valid`: `YES` or `NO`

### Why this matters
- Fallback is not the same as mock.
- Historical persistence is not the same as live fetch.
- Derived values are not independent source evidence.

## 5. Tighten validation severity rules
The current validation section is directionally useful but too permissive.

### Required severity logic
Use:
- `PASS`
- `WARN`
- `FAIL`

### Mandatory `FAIL` cases
These must render as `FAIL`, not `WARN`:
- paper promotion possible while decision is `NO_TRADE`
- paper promotion possible while `Run Valid for Trading = NO`
- risk gate marked pass when equity or ATR input is simulated
- critical market dataset disconnected
- decision marked trading-usable when critical feeds are mock

### `WARN` cases
Use `WARN` only for non-fatal but notable issues, for example:
- sector feed fallback used,
- one non-critical filter not implemented,
- cached history used instead of refetch.

## 6. Add critical feed classification
Not all datasets matter equally.

### Classify datasets as:
- `critical_for_decision`
- `critical_for_risk`
- `important_noncritical`
- `diagnostic_only`

### Minimum critical feeds
These should default to critical:
- Nifty OHLCV
- India VIX
- FII cash flow input if used in decision logic
- PCR / option-chain input if used in decision logic
- active universe OHLCV batch for leadership
- equity / drawdown input for risk gating
- ATR input for sizing or risk gating

If any critical feed is mock or missing, the run must not be trading-valid.

## 7. Strengthen risk truthfulness
Risk is currently the most dangerous place to overstate readiness.

### Required changes
- If equity curve is simulated, risk engine status must be `SIMULATED`.
- If ATR is not computed from real market data, risk output must not gate trading.
- If risk is simulated, show: `Risk output informational only — not valid for execution gating`.
- Never show `Risk gate PASS` on a run that is not trading-valid.

## 8. Fix decision-trace causality
Decision trace should not just show contributions; it should show whether those contributions were valid.

### Required columns
Use:
- Engine
- Status
- Vote / Gate
- Confidence Impact
- Validity
- Note

### Example
| Engine | Status | Vote / Gate | Confidence Impact | Validity | Note |
|---|---|---|---|---|---|
| Flows | SIMULATED | FAIL | 0 | NO | PCR and FII input are mock |

This prevents synthetic engines from looking equally trustworthy as real ones.

## 9. Add top-level summary sentence
At the top of the diagnostics page, add a plain-language run summary.

### Examples
- `This run is diagnostics-only because mock data is still in use.`
- `This run used real index data but simulated options, leadership, and risk inputs.`
- `This run is not eligible for paper or live trading.`

This is more effective than forcing the operator to infer the same thing from badges.

## 10. Block paper promotion explicitly
If trading validity fails, paper promotion should be visibly disabled.

### Required behavior
- Show `Paper Promotion: DISABLED`
- Show specific reasons
- If mode is `PAPER` but trading validity is `NO`, show `Paper mode active, promotion blocked by data validity`

This matters because paper trading is still part of the promotion path and should not silently continue on simulated decisioning.

## 11. Add consistency checks across sections
The diagnostics page must detect contradictions across panels.

### Required checks
- no engine marked `READY` if any critical dependency is `MOCK`
- no `Risk PASS` if risk engine is `SIMULATED`
- no `REAL_PLUS_FALLBACK` basis if any critical source is `MOCK`
- no `PAPER_ELIGIBLE` decision if run validity is `NO`
- no leader count > 0 with empty leader preview unless explicit suppression reason exists

These checks should appear in the validation panel and also be logged server-side.

## 12. Improve notes language
The notes are honest, but they can be made more structured.

### Required note taxonomy
Use standardized prefixes:
- `REAL:`
- `FALLBACK:`
- `MOCK:`
- `MISSING:`
- `SUPPRESSED:`
- `HISTORY:`

### Example
- `MOCK: VIX hardcoded to 18.0 until ^INDIAVIX source is connected`
- `FALLBACK: Nifty OHLCV loaded from yfinance after primary provider failed`

This improves scan speed and allows color-coding.

## Backend changes required
To support sign-off-grade behavior, backend persistence and evaluation logic must enforce the above states rather than leaving them to frontend interpretation.

### Required persisted fields per dataset
- dataset key
- provider
- source type
- freshness
- trading valid
- record count
- fetched at
- market date
- criticality level
- used in engine
- error / warning

### Required persisted fields per engine
- engine status
- validity
- dependency health summary
- downstream impact
- suppression reason
- criticality failures

### Required run-level fields
- run validity
- invalid reasons
- paper promotion allowed
- live trading allowed
- basis classification

## Innovative suggestions
These are not strict sign-off blockers, but they are high-value upgrades.

### 1. Confidence trust split
Separate:
- `Model Confidence`
- `Data Trust`

A run might have high directional confidence but low data trust. Showing both avoids false certainty.

### 2. Trading readiness score
Add a top-level composite score from 0 to 100 made from:
- feed coverage,
- freshness,
- engine validity,
- risk validity,
- and promotion eligibility.

This should not replace badges, but it helps with quick triage.

### 3. Source heatmap
Add a compact heatmap by dataset and engine showing:
- real,
- fallback,
- mock,
- missing,
- used,
- blocked.

This would make data provenance visually obvious faster than long tables.

### 4. Run-diff mode
Allow compare vs previous run:
- data source changes,
- engine status changes,
- validity changes,
- decision changes.

This would be especially useful when a source fails and silently shifts to fallback.

### 5. Promotion simulation banner
If the run is invalid, still show:
- what the system would have promoted,
- what it blocked,
- and why.

This is valuable during build-out because it lets you test promotion logic safely while real feeds are not fully connected.

### 6. Critical dependency map
Add a small visual graph:
- source → engine → decision → paper promotion

If a source fails, highlight the engines and downstream outcomes impacted.

### 7. Audit export
Allow exporting one run as a compact audit artifact containing:
- summary badges,
- source registry,
- decision trace,
- validation checks,
- warnings,
- and raw preview samples.

This will help with debugging and paper-trade review.

### 8. Badge click-through behavior
Let every top badge open the relevant panel automatically.

Examples:
- clicking `DEGRADED` scrolls to warnings,
- clicking `REAL_PLUS_FALLBACK` opens source provenance,
- clicking `PAPER` opens promotion state.

### 9. Trading-mode lock states
Show one of:
- `DIAGNOSTIC_ONLY`
- `PAPER_ALLOWED`
- `LIVE_BLOCKED`
- `LIVE_ALLOWED`

This is more decision-useful than generic mode labeling alone.

### 10. Threshold configurability panel
In diagnostics, show which threshold values drove the result:
- VIX threshold,
- breadth threshold,
- PCR threshold,
- drawdown threshold,
- confidence threshold.

This helps distinguish bad data from strict logic.

## UI implementation guidance
### Top strip order
Render in this order:
1. Pipeline Status
2. Run Valid for Trading
3. Basis
4. Mode
5. Decision
6. Paper Promotion State

### Color guidance
- READY / PASS / VALID = green
- DEGRADED / WARN / PARTIAL = amber
- SIMULATED / FAIL / INVALID = red-amber or red
- SUPPRESSED / DIAGNOSTIC_ONLY = grey-blue

### Empty state guidance
Avoid generic empty states.
Always explain causality.

## Acceptance criteria for sign-off
Do not sign off until all are true:
- top strip includes run-validity state,
- no critical mock-driven engine is labeled `READY`,
- decision labels are operationally meaningful,
- validation severities are strict enough,
- paper promotion is blocked when data validity fails,
- source type and freshness are separated,
- and the page states clearly whether the run is usable for trading.

## Final recommendation
The current implementation is close on design, but not on truth semantics.

The fastest path to sign-off is not more polish. It is stricter classification, stricter gating, and stronger causal labeling.
