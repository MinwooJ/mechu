---
name: quality-gate
description: Run MECHU validation gates based on lane severity.
---

# Quality Gate

Use this skill before handoff or integration.

## Command
- `.agents/scripts/run-quality-gate.sh fast`
- `.agents/scripts/run-quality-gate.sh standard`
- `.agents/scripts/run-quality-gate.sh multi`

## Notes
- Multi lane must include core Playwright smoke checks.
- Save failing command output in handoff notes.
