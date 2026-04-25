---
wave: 2
depends_on:
  - 01-paper-lifecycle-schema-PLAN.md
files_modified:
  - pipeline/engines/promotion.py
  - pipeline/main.py
  - config/default.yaml
requirements_addressed:
  - REQ-302
autonomous: true
---

# Plan: Promotion Engine and Rule-Based Sizing

## Objective
Implement promotion logic that deterministically converts recommendations into paper orders only when strict gates pass.

## Tasks

<task>
<id>promo-001</id>
<objective>Create promotion engine module</objective>
<read_first>
- pipeline/engines/advisor.py
- .planning/phases/03-automated-paper-execution/03-RESEARCH.md
</read_first>
<action>
Create `pipeline/engines/promotion.py` with:
- Gate checks:
  - regime in bullish or bearish only.
  - confidence >= 60.
  - risk halt false.
- Rejection reason taxonomy for each failed gate.
- Deterministic sizing basis using fixed `risk.base_risk_pct` from config.
</action>
<acceptance_criteria>
- Same input snapshot always returns same promotion decision and sizing fields.
- Rejections include explicit reason and failed gate metadata.
</acceptance_criteria>
</task>

<task>
<id>promo-002</id>
<objective>Integrate promotion into pipeline run</objective>
<read_first>
- pipeline/main.py
- pipeline/persist.py
</read_first>
<action>
Update `pipeline/main.py` to:
- run advisor output through promotion engine,
- create pending or rejected paper order records,
- create open paper trade record when promotion passes.
</action>
<acceptance_criteria>
- Pipeline run logs clear promotion outcomes.
- No-trade path produces rejected paper order with reason.
- Promotion pass path produces both paper order and open paper trade records.
</acceptance_criteria>
</task>

<task>
<id>promo-003</id>
<objective>Expose strict defaults in config</objective>
<read_first>
- config/default.yaml
</read_first>
<action>
Add paper execution settings in `config/default.yaml`:
- allowed regimes,
- confidence threshold,
- risk halt behavior,
- sizing basis references.
</action>
<acceptance_criteria>
- Defaults reflect selected strict policy.
- Config is read by pipeline without breaking existing keys.
</acceptance_criteria>
</task>

## Verification
- Scenario tests for bullish pass, bearish pass, range reject, low-confidence reject, and risk-halt reject.
- Determinism check: repeated same-run replay yields same decision and sizing basis.

