---
wave: 3
depends_on:
  - 02-backend-skeleton-PLAN.md
files_modified:
  - frontend/package.json
  - frontend/app/page.tsx
  - frontend/components/HealthBanner.tsx
requirements_addressed:
  - REQ-005
autonomous: true
---

# Plan: Frontend Foundation

## Objective
Establish a base React/Next.js application on Vercel that displays the system health status from Supabase.

## Tasks

<task>
<id>frontend-001</id>
<objective>Initialize Next.js project</objective>
<read_first>
- .planning/PROJECT.md
</read_first>
<action>
Initialize a Next.js project in the 'frontend' directory using `npx create-next-app@latest frontend --typescript --tailwind --eslint`.
(Note: Since I'm an agent, I'll create the core files manually if npx is too heavy, or run the command).
</action>
<acceptance_criteria>
- 'frontend/package.json' exists
- 'frontend/app/layout.tsx' exists
</acceptance_criteria>
</task>

<task>
<id>frontend-002</id>
<objective>Implement Health Banner Component</objective>
<read_first>
- .planning/phases/00-foundation-and-operating-model/00-RESEARCH.md
</read_first>
<action>
Create 'frontend/components/HealthBanner.tsx' that:
- Fetches the latest row from 'pipeline_health'.
- Displays a status indicator (Green for Healthy, Red for FAILED/Delayed).
- Shows the 'last_success_at' timestamp.
</action>
<acceptance_criteria>
- File 'frontend/components/HealthBanner.tsx' exists
- Component uses Supabase client to fetch health status
</acceptance_criteria>
</task>

<task>
<id>frontend-003</id>
<objective>Create Main Dashboard Shell</objective>
<read_first>
- frontend/components/HealthBanner.tsx
</read_first>
<action>
Update 'frontend/app/page.tsx' to:
- Include the HealthBanner at the top.
- Show a "System Foundation" header.
- List the active roadmap stage from PROJECT.md (Stage 0).
</action>
<acceptance_criteria>
- 'frontend/app/page.tsx' contains the HealthBanner
- Page displays "Stage 0: Foundation"
</acceptance_criteria>
</task>

## Verification
- Run `npm run dev` in the frontend directory.
- Verify the health status correctly reflects mock data in Supabase.
- Check responsiveness of the health banner.
