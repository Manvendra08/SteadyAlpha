---
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260425000002_paper_execution_schema.sql
  - pipeline/persist.py
requirements_addressed:
  - REQ-301
autonomous: true
---

# Plan: Paper Lifecycle Schema and Persistence

## Objective
Create deterministic schema and persistence helpers for paper-order and paper-trade lifecycle records.

## Tasks

<task>
<id>paper-001</id>
<objective>Create paper execution schema migration</objective>
<read_first>
- .planning/phases/03-automated-paper-execution/00-CONTEXT.md
- steadyalpha-master-roadmap.md
</read_first>
<action>
Create `supabase/migrations/20260425000002_paper_execution_schema.sql` with:
- `paper_orders` table linked to `run_registry.run_id`.
- `paper_trades` table linked to `paper_orders.id`.
- explainability fields: confidence at entry, sizing basis, rejection reason.
- uniqueness/indexing for deterministic per-run candidate handling.
</action>
<acceptance_criteria>
- SQL migration file exists and is syntactically valid.
- `paper_orders` and `paper_trades` are linked through FK.
- Table fields support complete lifecycle and rejection tracking.
</acceptance_criteria>
</task>

<task>
<id>paper-002</id>
<objective>Add persistence helper functions</objective>
<read_first>
- pipeline/persist.py
</read_first>
<action>
Update `pipeline/persist.py` with persistence helper stubs (same style as existing foundation stubs):
- `create_paper_order(...)`
- `mark_paper_order_status(...)`
- `create_paper_trade(...)`
- `close_paper_trade(...)`
Include explicit print diagnostics for lifecycle transitions.
</action>
<acceptance_criteria>
- Helper function signatures support all core lifecycle transitions.
- No existing run registry behavior regresses.
</acceptance_criteria>
</task>

## Verification
- Migration applies cleanly after existing signal schema.
- Lifecycle helper calls log expected transitions for pending, rejected, open, and closed states.

