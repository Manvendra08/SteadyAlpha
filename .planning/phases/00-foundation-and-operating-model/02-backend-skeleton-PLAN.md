---
wave: 2
depends_on:
  - 01-infra-setup-PLAN.md
files_modified:
  - supabase/migrations/20260425000000_init_schema.sql
  - pipeline/main.py
  - pipeline/persist.py
requirements_addressed:
  - REQ-003
  - REQ-004
autonomous: true
---

# Plan: Backend Skeleton & Run Registry

## Objective
Implement the Supabase schema for run tracking and the Python logic to register runs and health status.

## Tasks

<task>
<id>backend-001</id>
<objective>Initialize Supabase Schema</objective>
<read_first>
- .planning/phases/00-foundation-and-operating-model/00-RESEARCH.md
</read_first>
<action>
Create 'supabase/migrations/20260425000000_init_schema.sql' with:
- TABLE run_registry (run_id UUID PRIMARY KEY, trigger_type TEXT, status TEXT, code_version TEXT, config_snapshot JSONB, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ)
- TABLE pipeline_health (pipeline_id TEXT PRIMARY KEY, last_run_id UUID, health_status TEXT, last_success_at TIMESTAMPTZ)
</action>
<acceptance_criteria>
- Migration file exists in supabase/migrations/
- SQL contains 'CREATE TABLE run_registry'
- SQL contains 'config_snapshot JSONB'
</acceptance_criteria>
</task>

<task>
<id>backend-002</id>
<objective>Implement Run Registration Logic</objective>
<read_first>
- .planning/phases/00-foundation-and-operating-model/00-CONTEXT.md
</read_first>
<action>
Create 'pipeline/persist.py' with functions:
- `register_run(trigger_type, code_version, config_snapshot)`: Inserts into run_registry, returns run_id.
- `update_run_status(run_id, status, error_summary=None)`: Updates status and completed_at.
- `update_health(pipeline_id, run_id, status)`: Updates pipeline_health.
</action>
<acceptance_criteria>
- File 'pipeline/persist.py' exists
- File contains 'def register_run'
</acceptance_criteria>
</task>

<task>
<id>backend-003</id>
<objective>Create Pipeline Main Entry Point</objective>
<read_first>
- pipeline/persist.py
- config/default.yaml
</read_first>
<action>
Create 'pipeline/main.py' that:
1. Loads all files in 'config/' as a single dict.
2. Calls `register_run` with `TRIGGER_TYPE` and `CODE_VERSION` from env.
3. Prints the 'run_id' for logs.
4. (Placeholder for engines)
5. Calls `update_run_status` to 'success'.
</action>
<acceptance_criteria>
- File 'pipeline/main.py' exists
- File contains 'register_run' call
- File contains logic to read 'config/' directory
</acceptance_criteria>
</task>

## Verification
- Run `python pipeline/main.py` (simulated with mock DB or local env).
- Verify `config_snapshot` serialization logic in a test script.
- Check SQL syntax for migrations.
