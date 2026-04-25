# Phase 0: Foundation and Operating Model - Validation Strategy

## Phase Goal
Create a stable operating skeleton for SteadyAlpha.

## Validation Dimensions

### 1. Operational Integrity (Dimension 1)
- [ ] Pipeline can start and register a run in Supabase.
- [ ] Failures are captured in `run_registry` and visible in the health banner.

### 2. Traceability (Dimension 8)
- [ ] Every run registers the current `git_sha`.
- [ ] `config_snapshot` contains the serialized content of all files in `/config`.

### 3. Environment Stability
- [ ] CI/CD pipeline successfully deploys to Vercel and Supabase.
- [ ] Secrets are correctly loaded from environment variables.

## Acceptance Criteria
- `run_registry` has at least one successful row with a valid JSON `config_snapshot`.
- Frontend loads and displays "Healthy" status from `pipeline_health`.
- GitHub Action `pipeline.yml` runs successfully on a schedule.

---
*Date: 2026-04-25*
*Phase: 00-foundation-and-operating-model*
