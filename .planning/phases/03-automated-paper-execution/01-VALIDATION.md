# Phase 3: Automated Paper Execution - Validation Strategy

## Phase Goal
Create deterministic, explainable paper-order and paper-trade lifecycle with full operator inspection.

## Validation Dimensions

### 1. Lifecycle Integrity
- [ ] Promotion pass creates `paper_orders` row and linked `paper_trades` open row.
- [ ] Promotion fail creates `paper_orders` row with `rejected` status and explicit reason.
- [ ] Trade close path updates `paper_trades` with exit fields and pnl.

### 2. Rule Correctness
- [ ] Regime gate rejects non-tradable states.
- [ ] Confidence gate rejects values below configured threshold.
- [ ] Risk halt gate blocks promotion when active.
- [ ] Sizing basis uses fixed risk percent from config.

### 3. Determinism and Traceability
- [ ] Same input snapshot yields same decision and sizing values.
- [ ] Every paper row links back to source `run_id` and signal context.
- [ ] Rejection reasons are stable and human-readable.

### 4. UI Explainability
- [ ] Paper orders screen shows source signal, confidence, sizing basis, and status.
- [ ] Open trades screen shows active lifecycle state.
- [ ] Closed trades screen shows exit reason and pnl.

## Acceptance Criteria
- `paper_orders` and `paper_trades` lifecycle behaves as specified across pass and fail paths.
- Promotion logic satisfies strict defaults selected by operator.
- UI allows end-to-end inspection from signal to paper outcome for each row.

---
*Date: 2026-04-25*
*Phase: 03-automated-paper-execution*

