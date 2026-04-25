# Phase 0: Foundation and Operating Model - Research

## Objective
Research how to implement the minimum system skeleton for SteadyAlpha.

## 1. GitHub Actions & Supabase Integration
### Secrets Management
- Store `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_ID`, and `SUPABASE_DB_PASSWORD` in GitHub Secrets.

### CI/CD Strategy
- **CI:** Run `supabase db lint` on PRs.
- **CD:** Use `supabase db push` to apply migrations on push to main.

## 2. Deterministic Replay & run_registry
### Config Snapshotting
- The `run_registry` table must capture the state of all config files at the start of a run.
- Schema should include a `config_snapshot` JSONB column.

### Idempotency
- Use a unique `idempotency_key` based on `pipeline_id + execution_date`.

## 3. Vercel Deployment (Python/JS Hybrid)
### Monorepo Structure
- `/api`: Python backend (FastAPI/Flask).
- `/frontend`: React/Next.js frontend.
- `vercel.json` for routing.

## 4. Proposed Database Schema
### Table: `run_registry`
- `id` (UUID, PK)
- `trigger_type` (text: scheduled/manual)
- `status` (text: running/success/failed)
- `git_sha` (text)
- `config_snapshot` (jsonb)
- `started_at` (timestamptz)
- `completed_at` (timestamptz)

### Table: `pipeline_health`
- `pipeline_id` (text, PK)
- `last_run_id` (uuid, FK)
- `health_status` (text: healthy/degraded/failing)
- `last_success_at` (timestamptz)

## 5. Validation Architecture (Nyquist)
- **Dimension 1 (Freshness):** UI must show "delayed" badge if `run_ts` > 15m.
- **Dimension 2 (Completeness):** `run_registry` must have no NULL `config_snapshot`.
- **Dimension 8 (Traceability):** Every signal must link back to a `run_id`.

---
*Research complete: 2026-04-25*
