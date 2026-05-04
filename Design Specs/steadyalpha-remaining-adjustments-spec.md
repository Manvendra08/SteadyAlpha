# SteadyAlpha Remaining Adjustments Spec

## Purpose
This document captures the remaining implementation adjustments after the latest decision-engine tuning rollout.

The core diagnostics and decision UX are now materially correct. The remaining work is limited to consistency-panel correctness, terminology alignment, and post-implementation confidence calibration.

## Current status
The current system is close to sign-off for the decision-engine UX because:
- engine validity and directional vote are now separated,
- watchlist-long behavior is aligned with engine evidence,
- leadership is no longer suppressed circularly,
- and the master decision engine is operationally interpretable.

The remaining work should not trigger another redesign cycle.

## Scope
This spec covers only the remaining adjustments:
1. consistency and validation panel alignment,
2. terminology cleanup in cross-engine trace,
3. leadership threshold transparency,
4. confidence calibration workflow,
5. final QA checklist.

## 1. Fix stale or mismatched Consistency Checks logic
### Problem
The Consistency Checks panel appears to be using outdated rules or stale state.

It still references conditions such as:
- mock-driven engines,
- simulated equity logic,
- invalid trading runs,
- and paper-promotion gate failures,

while the current page clearly shows:
- real feeds,
- valid trading run,
- watchlist-long output,
- and updated engine semantics.

This creates trust damage because the diagnostics layer appears internally inconsistent.

### Required change
Refactor the Consistency Checks panel so it evaluates only against the current run state and current rule model.

### Required implementation rules
- Checks must use current run data only, never cached prior-run booleans.
- Checks must use current status taxonomy and current decision mapping.
- Checks must be recomputed after decision-engine final mapping, not before.
- If a check is no longer relevant to the current state, omit it or mark it as `Not Applicable`.

### Required checks for current system
Use checks such as:
- `No VALID engine has missing critical dependency`
- `Run validity matches source provenance`
- `Paper promotion disabled unless final action is eligible`
- `Directional vote semantics align with engine state`
- `Decision label matches action thresholds`
- `Leadership state computed before final decision`
- `No mock-only warnings on real-data run`

### Disallowed behavior
- showing simulated/mock checks on a real-data run,
- surfacing historical fail conditions from previous pipeline versions,
- mixing validation of old and new semantics.

## 2. Clean up Validation Checks set
### Problem
The Validation Checks panel is now too narrow and does not reflect the upgraded model fully.

### Required change
Expand validation checks to match the current architecture.

### Required validation checks
Add or confirm these checks:
- `Run Valid for Trading`
- `Risk circuit breaker state valid`
- `Confidence in 0–100 range`
- `Decision label is operational`
- `Directional confidence >= watchlist floor when watchlist state used`
- `Action confidence <= paper threshold when not paper-eligible`
- `All critical datasets trading-valid`
- `Cross-engine trace terminology aligned`
- `Consistency panel aligned with current rule model`

### Severity guidance
- semantic contradiction => `FAIL`
- missing informational enhancement => `WARN`
- valid implemented rule => `PASS`

## 3. Standardize `NEUTRAL` vs `FAIL` terminology in Decision Trace
### Problem
The current trace can still imply that a neutral engine “failed,” which is misleading.

### Required change
Use a strict directional-vote vocabulary.

### Required directional vote values
- `LONG`
- `SHORT`
- `NEUTRAL`
- `WEAK`
- `BLOCKED`
- `PASS_EXECUTION` for risk only

### Required validity values
- `VALID`
- `DEGRADED`
- `INVALID`

### Mapping rules
- Neutral flow input must render as `NEUTRAL`, not `FAIL`
- Weak leadership with no qualifiers should render as `WEAK` or `NEUTRAL`, not `FAIL`
- Risk may use `PASS_EXECUTION` or `BLOCKED`, not directional labels
- `FAIL` should be reserved for validation outcomes, not directional semantics

### UI impact
Update:
- cross-engine impact table,
- engine card trace views,
- decision explainer references,
- validation logic tied to directional vocabulary.

## 4. Add leadership threshold transparency
### Problem
Leadership correctly shows low coverage or zero qualifiers, but the threshold logic is not explicit enough to the operator.

### Required change
Expose the threshold used for coverage and qualification.

### Required UI additions
Show either inline or in tooltip:
- current coverage percent,
- required coverage threshold,
- leaders required for positive vote,
- current leaders count.

### Example
- `Coverage: 53% (threshold: 60%)`
- `Qualifying leaders: 0 / minimum 2 for supportive vote`

### Backend requirement
Persist threshold values used for the current run so the UI is not hardcoding them blindly.

## 5. Tighten master decision summary sentence
### Problem
The master decision summary is already improved, but it should be generated from structured reasons and stay fully consistent with the final action.

### Required change
Generate the summary sentence from structured reason fields.

### Example output patterns
- `Regime LONG supports watchlist state; secondary engines are neutral or weak.`
- `Bullish directional setup detected, but promotion threshold not met.`
- `Directional bias exists, but leadership support is insufficient for paper promotion.`

### Rule
The summary sentence must reference:
- directional driver,
- why it did not escalate further,
- and whether risk/promotion gates were open.

## 6. Keep confidence numbers, but move tuning to replay analysis
### Problem
Directional and action confidence are still low for seemingly acceptable setups.

### Required change
Do not keep visually redesigning the confidence blocks.

Instead, tune confidence using replay analysis and threshold studies.

### Required workflow
- replay last 20–50 runs,
- capture old and new decision labels,
- measure watchlist frequency,
- measure paper-eligible frequency,
- examine false-positive rate,
- adjust score weights or floors only after evidence.

### Required metrics
Track:
- count of `WATCHLIST_LONG`
- count of `WATCHLIST_SHORT`
- count of `LONG_BIAS_LOW_CONF`
- count of `SHORT_BIAS_LOW_CONF`
- count of `PAPER_ELIGIBLE`
- directional confidence distribution
- action confidence distribution

## 7. Add confidence calibration diagnostics
### Required addition
Create a small diagnostics subsection or export fields for:
- raw regime contribution,
- raw flow contribution,
- raw leadership contribution,
- raw risk/execution contribution,
- watchlist floor applied: yes/no,
- paper threshold met: yes/no,
- blocking reason.

### Reason
This prevents future guesswork about why a run landed at 16% versus 24% or 38%.

## 8. Final QA rules
Before final sign-off, validate these scenarios:

### Scenario A — bullish regime, neutral flow, weak leadership, active risk
Expected result:
- `WATCHLIST_LONG`

### Scenario B — bullish regime, supportive flow, supportive leadership, active risk
Expected result:
- `LONG_BIAS_LOW_CONF` or `PAPER_ELIGIBLE` depending on score

### Scenario C — bearish regime, neutral flow, weak leadership, active risk
Expected result:
- `WATCHLIST_SHORT`

### Scenario D — valid directional setup but risk blocked
Expected result:
- `NO_TRADE`

### Scenario E — invalid data run
Expected result:
- `INVALID_FOR_TRADING`

### Scenario F — leadership strong but regime range-bound
Expected result:
- usually `NO_TRADE` or low-priority watchlist depending on policy

## 9. Final implementation checklist
- fix consistency panel data source and predicates
- update validation checks to current model
- replace residual `FAIL` directional wording with `NEUTRAL` / `WEAK` / `BLOCKED`
- expose leadership thresholds in UI
- generate summary sentence from structured reasons
- add confidence-calibration debug fields
- run scenario QA
- run 20–50 run replay study

## Acceptance criteria
This remaining work is complete only when:
- consistency checks reflect current run truth,
- validation panel matches current rule model,
- decision trace terminology is semantically clean,
- leadership thresholds are visible,
- master decision summary is structured and reproducible,
- and confidence tuning is moved to evidence-based replay analysis rather than UI iteration.

## Final recommendation
Stop redesigning the page.

Fix the stale consistency logic, clean up semantics, then move immediately to replay-based behavior tuning.

The UI is now good enough. The remaining gains will come from evidence-based calibration, not more layout work.
