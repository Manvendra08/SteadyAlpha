---
wave: 1
depends_on: []
files_modified:
  - .github/workflows/ci.yml
  - .github/workflows/pipeline.yml
  - .gitignore
  - config/default.yaml
requirements_addressed:
  - REQ-001
  - REQ-002
  - REQ-006
autonomous: true
---

# Plan: Infrastructure Setup

## Objective
Establish the repository structure and configure the GitHub Actions environment for CI and pipeline execution.

## Tasks

<task>
<id>infra-001</id>
<objective>Create repository folder structure</objective>
<read_first>
- .planning/PROJECT.md
</read_first>
<action>
Create the following directories:
- pipeline/
- frontend/
- supabase/migrations/
- config/
- tests/
</action>
<acceptance_criteria>
- Directory 'pipeline' exists
- Directory 'frontend' exists
- Directory 'supabase/migrations' exists
- Directory 'config' exists
- Directory 'tests' exists
</acceptance_criteria>
</task>

<task>
<id>infra-002</id>
<objective>Configure .gitignore for GSD and Python</objective>
<read_first>
- .gitignore
</read_first>
<action>
Ensure .gitignore contains:
- __pycache__/
- .env
- .planning/ (if commit_docs is false, but here it's true, so maybe not)
- node_modules/
- .vercel/
</action>
<acceptance_criteria>
- .gitignore contains '__pycache__/'
- .gitignore contains '.env'
</acceptance_criteria>
</task>

<task>
<id>infra-003</id>
<objective>Create base configuration file</objective>
<read_first>
- .planning/REQUIREMENTS.md
</read_first>
<action>
Create 'config/default.yaml' with initial thresholds:
```yaml
universe: F&O 200
regime:
  hysteresis_days: 2
risk:
  base_risk_pct: 0.75
  drawdown_limit_pct: 6.0
```
</action>
<acceptance_criteria>
- File 'config/default.yaml' exists
- File contains 'universe: F&O 200'
</acceptance_criteria>
</task>

<task>
<id>infra-004</id>
<objective>Setup GitHub Actions Workflow for Pipeline</objective>
<read_first>
- .planning/phases/00-foundation-and-operating-model/00-CONTEXT.md
</read_first>
<action>
Create '.github/workflows/pipeline.yml' with:
- Trigger: schedule (0 10 * * *) and workflow_dispatch
- Env: CODE_VERSION: ${{ github.sha }}
- Steps: Checkout, Setup Python, Run 'python pipeline/main.py'
</action>
<acceptance_criteria>
- '.github/workflows/pipeline.yml' exists
- File contains 'CODE_VERSION: ${{ github.sha }}'
</acceptance_criteria>
</task>

## Verification
- Run `ls -R` to verify structure.
- Validate YAML syntax in `config/default.yaml`.
- Check `.github/workflows/pipeline.yml` syntax.
