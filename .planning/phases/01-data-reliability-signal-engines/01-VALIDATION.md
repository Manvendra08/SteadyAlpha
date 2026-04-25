# Phase 1: Data Reliability & Signal Engines - Validation Strategy

## Phase Goal
Implement trustworthy data ingestion and core analytical engines for market intelligence.

## Validation Dimensions

### 1. Data Integrity (Dimension 1)
- [ ] Ingestion logic correctly identifies `stale` data based on current timestamp vs last close.
- [ ] `SourceHierarchy` fallback logic triggers when primary source fails.

### 2. Analytical Accuracy (Dimension 2)
- [ ] RS Slope Z-scores match manual spreadsheet calculations for a sample set.
- [ ] Regime Engine correctly maintains state within the hysteresis dead-zone.

### 3. Traceability (Dimension 8)
- [ ] Every engine run creates an entry in `engine_audit`.
- [ ] `signals_summary` contains a complete snapshot of all three core engines.

## Acceptance Criteria
- `signals_summary` row is created successfully for a full universe run.
- `engine_audit` captures the `input_digest` for the Regime engine.
- RS Slope rankings consistently identify known leaders in Bullish regimes.

---
*Date: 2026-04-25*
*Phase: 01-data-reliability-signal-engines*
