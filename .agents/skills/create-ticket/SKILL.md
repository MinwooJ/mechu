---
name: create-ticket
description: Create a standardized MECHU implementation ticket with lane, scope, validation gates, and approval checkpoint.
---

# Create Ticket

Use this skill when a new task starts.

## Steps
1. Analyze and restate the request.
2. Select lane: `fast`, `standard`, `multi`.
3. Assign owner agent.
4. Define editable paths and non-goals.
5. List assumptions and unresolved questions.
6. Set `approval-status: pending` until explicit user approval is received.
7. Define done criteria and validation commands.
8. List known risks.

## Output
Use `.agents/templates/ticket.md` exactly.
Implementation must not start while `approval-status` is `pending`.
