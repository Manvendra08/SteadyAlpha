---
wave: 3
depends_on:
  - 02-core-engines-PLAN.md
files_modified:
  - pipeline/main.py
  - pipeline/persist.py
  - supabase/migrations/20260425000001_signal_schema.sql
requirements_addressed:
  - REQ-105
autonomous: true
---

# Plan: Engine Persistence & Audit

## Objective
Finalize the database schema for signals and wire the engines into the main pipeline with audit tracking.

## Tasks

<task>
<id>audit-001</id>
<objective>Create Signal and Audit Schema</objective>
<read_first>
- .planning/phases/01-data-reliability-signal-engines/01-RESEARCH.md
</read_first>
<action>
Create 'supabase/migrations/20260425000001_signal_schema.sql' with:
- TABLE engine_audit
- TABLE signals_summary
- TABLE stock_scores (for granular rankings)
</action>
<acceptance_criteria>
- SQL file exists.
- `signals_summary` has a FK to `run_registry.run_id`.
</acceptance_criteria>
</task>

<task>
<id>audit-002</id>
<objective>Wire Engines into Main Pipeline</objective>
<read_first>
- pipeline/main.py
- pipeline/engines/regime.py
- pipeline/engines/flows.py
- pipeline/engines/leadership.py
</read_first>
<action>
Update 'pipeline/main.py' to:
1. Validate data using 'validate.py'.
2. Execute Regime, Flows, and Leadership engines in sequence.
3. Collate results into a single row for `signals_summary`.
4. Log diagnostics to `engine_audit`.
</action>
<acceptance_criteria>
- `pipeline/main.py` successfully completes a full analytical pass.
- `signals_summary` row is populated in Supabase.
</acceptance_criteria>
</task>

## Verification
- Run `python pipeline/main.py` and verify `signals_summary` output.
- Check `engine_audit` for correct input/output digests.
