---
wave: 2
depends_on:
  - 01-data-reliability-PLAN.md
files_modified:
  - pipeline/engines/regime.py
  - pipeline/engines/flows.py
  - pipeline/engines/leadership.py
requirements_addressed:
  - REQ-102
  - REQ-103
  - REQ-104
autonomous: true
---

# Plan: Core Signal Engines

## Objective
Implement the analytical core engines for Regime, Flows, and Leadership using validated data.

## Tasks

<task>
<id>engine-001</id>
<objective>Implement Regime Engine with Hysteresis</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-RESEARCH.md
</read_first>
<action>
Create 'pipeline/engines/regime.py' that:
- Reads historical scores from Supabase.
- Applies +/- 0.5 Z-score hysteresis thresholds.
- Requires 2-day confirmation for state changes.
</action>
<acceptance_criteria>
- Engine maintains current state if score is in dead-zone (e.g., 0.2).
- State changes only after 2 days of crossing threshold.
</acceptance_criteria>
</task>

<task>
<id>engine-002</id>
<objective>Implement Flows Engine</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-CONTEXT.md
</read_first>
<action>
Create 'pipeline/engines/flows.py' that:
- Aggregates FII/DII net flows.
- Calculates PCR percentile from raw option data.
- Computes Sector RS relative to Nifty 50.
</action>
<acceptance_criteria>
- PCR percentile logic handles 0-100 range correctly.
- Sector RS uses the same 20-day window as leadership.
</acceptance_criteria>
</task>

<task>
<id>engine-003</id>
<objective>Implement Leadership Engine (RS Slope Ranking)</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-RESEARCH.md
</read_first>
<action>
Create 'pipeline/engines/leadership.py' that:
- Fetches F&O 200 universe prices.
- Calculates 20-day RS Slope using `np.polyfit`.
- Normalizes slopes using `scipy.stats.zscore`.
- Ranks stocks.
</action>
<acceptance_criteria>
- Rank 1 stock has the highest Z-score.
- Logic handles missing symbols in the universe gracefully.
</acceptance_criteria>
</task>

## Verification
- Run engines against mock historical data.
- Compare RS rankings with manual baseline in 'tests/baselines'.
