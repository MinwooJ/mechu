#!/usr/bin/env bash
set -euo pipefail

base_ref="${1:-}"

if [[ -n "$base_ref" ]]; then
  files="$(git diff --name-only "$base_ref"...HEAD)"
else
  if git rev-parse --verify HEAD~1 >/dev/null 2>&1; then
    files="$(git diff --name-only HEAD~1...HEAD)"
  else
    files="$(git diff --name-only)"
  fi
fi

count="$(printf '%s\n' "$files" | sed '/^\s*$/d' | wc -l | tr -d ' ')"
lane="fast"

# Multi-lane hard triggers from AGENTS.md
if printf '%s\n' "$files" | rg -q '^(wrangler\.jsonc|app/results/kakao-map\.tsx|app/results/interactive-map\.tsx|app/api/recommendations/route\.ts|app/globals\.css|app/components/|lib/reco/|app/.*/page\.tsx|app/layout\.tsx|app/sitemap\.ts|app/robots\.ts)'; then
  lane="multi"
else
  # Soft complexity signal: many changed files + runtime code touched
  if printf '%s\n' "$files" | rg -q '^(app/|lib/|migrations/|open-next\.config\.ts|package\.json|package-lock\.json)'; then
    if [[ "$count" -gt 10 ]]; then
      lane="multi"
    fi
  fi

  # Standard-lane cross-boundary hints
  if [[ "$lane" != "multi" ]]; then
    if printf '%s\n' "$files" | rg -q '^(app/api/|app/results/|app/onboarding/|app/preferences/|migrations/)'; then
      lane="standard"
    elif [[ "$count" -gt 3 ]]; then
      lane="standard"
    fi
  fi
fi

printf '%s\n' "$lane"
