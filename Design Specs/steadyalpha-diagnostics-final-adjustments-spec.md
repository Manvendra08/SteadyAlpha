# SteadyAlpha Diagnostics Page — Final Adjustments Spec

## Purpose
This document captures the final developer-facing adjustments required to move the Engine Health + Decision Trace diagnostics page from near-sign-off to sign-off quality.

The current page direction is correct. The remaining work is semantic tightening, scoring transparency, and status-model cleanup.

## Scope
This spec covers only the final refinements for the diagnostics page and its supporting status logic.

It does not replace:
- ingestion architecture,
- provenance schema,
- or data-adapter implementation work.

Those remain separate system requirements.

## Final adjustment summary
The diagnostics page is now structurally strong, honest, and useful.

The remaining gaps are:
1. engine status semantics,
2. pipeline status semantics,
3. provenance labeling consistency,
4. score transparency,
5. and source heatmap readability.

## Required changes

### 1. Replace `WAITING` for active mock-driven engines
#### Problem
The current engine cards use `WAITING` while mock data is actively being used.

That is semantically wrong.

`WAITING` implies pending real data or insufficient history, not active simulation.

#### Required rule
Use these status meanings strictly:
- `READY` = all critical dependencies real and valid
- `DEGRADED` = real data present but incomplete, fallback, or stale in non-fatal ways
- `SIMULATED` = engine output depends on mock, hardcoded, synthetic, or non-trading-valid placeholders
- `SUPPRESSED` = engine intentionally excluded from decisioning
- `FAILED` = engine could not produce required output
- `WAITING` = waiting for first valid data, minimum history, or scheduled dependency arrival

#### Required implementation
For each engine:
- if any critical dependency has `source_type = MOCK`, set engine status to `SIMULATED`
- if dependency is absent and engine cannot compute, set to `FAILED` or `WAITING` based on context
- do not use `WAITING` as a generic invalid state

#### Affected components
- Engine Health cards
- Decision Trace table
- Validation checks
- Consistency checks

## 2. Split pipeline execution status from trading validity
#### Problem
The top strip currently risks conflating pipeline failure with data invalidity.

A pipeline can complete successfully while still producing a run that is invalid for trading.

#### Required status model
Expose three separate concepts:
- `Pipeline Status`: `SUCCESS`, `PARTIAL`, `FAILED`
- `Run Valid for Trading`: `YES`, `PARTIAL`, `NO`
- `Decision Status`: `NO_TRADE`, `WATCHLIST`, `LONG_BIAS`, `SHORT_BIAS`, `PAPER_ELIGIBLE`, `INVALID_FOR_TRADING`

#### Required rules
- `Pipeline Status = FAILED` only when the pipeline itself failed to execute correctly
- `Pipeline Status = PARTIAL` when the run completed but some feeds or engines degraded
- `Run Valid for Trading = NO` when critical data or risk conditions invalidate promotion
- `Decision Status = INVALID_FOR_TRADING` when validity is `NO`

#### Required UI change
In the top summary strip, show all three explicitly.

Example:
- `Pipeline: PARTIAL`
- `Run Valid for Trading: NO`
- `Decision: INVALID_FOR_TRADING`

## 3. Fix provenance semantics for mock and missing
#### Problem
The provenance table currently mixes `source_type = MOCK` with `freshness = MISSING`.

That is conceptually muddy.

If a mock value exists, the source is not missing. It is simulated.

#### Required change
Update the provenance model so freshness is only evaluated for data that actually has fetch/cached semantics.

#### Recommended source fields
- `source_type`: `REAL`, `FALLBACK`, `SCRAPED`, `CACHED`, `MOCK`, `HISTORY`, `CONFIG`, `DERIVED`, `MISSING`
- `freshness`: `FRESH`, `STALE`, `N/A`, `MISSING`

#### Required rules
- if `source_type = MOCK`, set `freshness = N/A`
- if `source_type = HISTORY`, freshness may be `FRESH` or `STALE` depending on use case
- if dataset fetch truly absent, use `source_type = MISSING` and `freshness = MISSING`
- do not use `MISSING` freshness for simulated values

#### Required UI copy examples
- `MOCK / N/A`
- `REAL / FRESH`
- `CACHED / STALE`
- `MISSING / MISSING`

## 4. Make Data Trust transparent
#### Problem
`Data Trust` is useful, but currently opaque.

A score without visible formula becomes a decorative number.

#### Required change
Expose the score calculation in tooltip, info popover, or expandable detail.

#### Minimum formula disclosure
Show factors such as:
- count of real datasets,
- count of fallback datasets,
- count of mock datasets,
- critical-feed penalty,
- stale-feed penalty.

#### Example formula
```text
Data Trust = base source coverage score
           - critical mock penalties
           - stale source penalties
           + validated history bonus
```

#### Required UI behavior
- hover or click on `Data Trust` reveals factor breakdown
- diagnostics should show which datasets are reducing trust the most

## 5. Make Trading Readiness transparent
#### Problem
`Trading Readiness` is a good operator score, but it is not auditable yet.

#### Required change
Expose score inputs clearly.

#### Minimum components
- critical feed connectivity
- engine validity
- risk validity
- paper promotion allowed
- run validity

#### Example formula disclosure
```text
Trading Readiness =
  30% critical feeds valid
  25% engine validity
  25% risk validity
  20% promotion eligibility
```

#### Required rule
If `Run Valid for Trading = NO`, readiness should be heavily capped.

## 6. Clarify Model Confidence semantics
#### Problem
`Model Confidence` can be misread as trade confidence even when the run is invalid.

#### Required change
When run validity is `NO`, annotate confidence explicitly.

#### Required UI copy
- `Model Confidence: 0% (trading-invalid run)`
or
- `Confidence unavailable — invalid data basis`

#### Required rule
Do not present model confidence as action-usable if trading validity is `NO`.

## 7. Add heatmap legend and interaction
#### Problem
The Source Heatmap is a good idea but not fully interpretable without a legend.

#### Required change
Add a fixed legend.

#### Minimum legend entries
- green = real and used
- amber = fallback or cached
- red = mock or invalid
- grey = not used / not applicable
- outlined or faded = dependency exists but vote suppressed

#### Optional interactions
- hover shows dataset, engine, source type, validity, and note
- click filters the provenance table to the selected dataset or engine

## 8. Improve summary banner wording
#### Problem
The summary banner is useful, but it should distinguish why the run is diagnostics-only.

#### Required change
Generate this banner dynamically from invalid reasons.

#### Example templates
- `This run is diagnostics-only because 6 critical feeds are simulated.`
- `This run is diagnostics-only because options and risk inputs are not trading-valid.`
- `This run is diagnostics-only because critical NSE feeds failed and no accepted fallback was available.`

## 9. Tighten validation checks
#### Problem
Validation checks are good, but a few should be stricter and clearer.

#### Required additions
Add explicit validation items for:
- `Engine status taxonomy valid`
- `Pipeline status consistent with run outcome`
- `Mock sources use freshness N/A`
- `Trading readiness capped when validity=NO`
- `Model confidence suppressed or annotated when run invalid`
- `Heatmap legend present`

#### Severity rules
- semantic contradictions = `FAIL`
- missing explanatory enhancements = `WARN`

## 10. Tighten consistency checks
#### Required additions
Add consistency rules for:
- no `WAITING` engine if mock dependencies are active
- no `READY` engine if any critical dependency is mock or missing
- no `SUCCESS` pipeline banner if run ended with hard pipeline execution failure
- no positive promotion state when validity is `NO`
- no trust/readiness score above configured cap when multiple critical feeds are invalid

## 11. Add developer-facing scoring config
#### Purpose
Avoid hardcoding trust/readiness formulas directly in UI components.

#### Required implementation
Create a config object such as:

```ts
export const diagnosticsScoringConfig = {
  dataTrust: {
    realDatasetWeight: 8,
    fallbackPenalty: 4,
    stalePenalty: 6,
    criticalMockPenalty: 20,
    criticalMissingPenalty: 25,
    historyBonus: 3,
    minWhenCriticalInvalid: 0,
    maxWhenValidityNo: 25,
  },
  tradingReadiness: {
    criticalFeedsWeight: 30,
    engineValidityWeight: 25,
    riskValidityWeight: 25,
    promotionEligibilityWeight: 20,
    maxWhenValidityNo: 10,
  }
}
```

Store or version this config so diagnostics behavior is explainable.

## 12. Add tooltip and info architecture
#### Required UI help targets
Add info icons or tooltip support for:
- Pipeline Status
- Run Valid for Trading
- Data Trust
- Trading Readiness
- Model Confidence
- Source Type
- Freshness
- Validity

#### Principle
This page is for power users, but key computed labels still need interpretable definitions.

## 13. Suggested copy refinements
Use clearer wording in a few places.

### Replace
- `Valid: NO`
with
- `Trading Valid: NO`

### Replace
- `Bias: NEUTRAL (SIMULATED)`
with
- `Bias: UNUSABLE_FOR_TRADING (simulated inputs)`
when applicable

### Replace
- `Mode: — INFORMATIONAL ONLY`
with
- `Risk Output: INFORMATIONAL ONLY`

These are small changes, but they reduce ambiguity.

## Backend/data-model impact
These UI refinements require these fields to exist or be computed consistently:
- engine status derived from dependency validity
- pipeline execution status separate from run validity
- source type separate from freshness
- scoring factor breakdown for trust/readiness
- invalid reasons array for banner generation

## Acceptance criteria
This page is sign-off ready only when:
- no mock-driven engine is labeled `WAITING`
- pipeline status and trading validity are clearly separated
- source type and freshness are logically consistent
- Data Trust and Trading Readiness have visible formulas or factor breakdowns
- Model Confidence is not misleading on invalid runs
- Source Heatmap has legend and interaction support
- validation and consistency checks cover the refined semantics

## Implementation order
1. Fix engine status taxonomy.
2. Split pipeline status from trading validity.
3. Refine provenance source_type vs freshness model.
4. Add trust/readiness score factor breakdown.
5. Add confidence invalid-run annotation.
6. Add heatmap legend and hover details.
7. Add new validation and consistency checks.
8. Apply copy refinements.
9. Run semantic QA against mock, partial, and real-data scenarios.

## Final recommendation
Do not redesign the page again.

The page is close. The remaining work is semantic precision and explainability, not layout.
