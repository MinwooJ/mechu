# AGENTS.md

## Project
MECHU is a location-based lunch/dinner recommendation web service.
Core principle: fast results, anonymous use, KR-first map/data quality.

## Orchestrator Intake Rule (Required)
Before any implementation starts, the orchestrator must follow:
1. Requirement analysis and restatement
2. Ambiguity/conflict detection
3. External research when needed
4. Clarification questions
5. Final scoped plan
6. Explicit user approval

No implementation is allowed before step 6.
If ambiguity appears during execution, pause and ask again.

## Lane Rules
Use the smallest lane first. Escalate only when risk increases.

### Fast lane
- File scope: 1-3 files
- No API contract changes
- No map provider branching changes
- No deploy/env policy changes
- Required checks: `npx tsc --noEmit`

### Standard lane
- Cross-boundary changes (UI+map or UI+API)
- File scope: 4-10 files
- Required checks: `npx tsc --noEmit`, `npm run build`

### Multi lane
- Country/provider branching, recommendation algorithm, env/deploy policy, SEO/meta policy impact
- Required checks: `npx tsc --noEmit`, `npm run build`, `npm run cf:build`, core Playwright smoke

## Escalation Triggers
If any condition matches, move to upper lane.
- `countryCode` logic update
- `app/results/kakao-map.tsx` or `app/results/interactive-map.tsx` update
- `wrangler.jsonc` or runtime/build env policy update
- `/api/recommendations` response contract update
- design system token update in `app/globals.css` or `app/components/**`

## Agent Registry
All agent definitions live under `.agents/agents/`.

- `.agents/agents/orchestrator/`
- `.agents/agents/frontend/`
- `.agents/agents/design/`
- `.agents/agents/map/`
- `.agents/agents/backend/`
- `.agents/agents/qa/`
- `.agents/agents/platform/`
- `.agents/agents/global-growth/`

## Standard Handoff Output
All agents must return:
1. Changed files
2. Design/implementation intent and tradeoffs
3. Validation commands run and outcomes
4. Remaining risks

## Shared Resources
- Ticket template: `.agents/templates/ticket.md`
- Handoff template: `.agents/templates/handoff.md`
- Skills: `.agents/skills/`
- Playbooks: `.agents/agents/*/*.md`, `docs/*.md`
