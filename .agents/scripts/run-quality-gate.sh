#!/usr/bin/env bash
set -euo pipefail

lane="${1:-fast}"
default_site_url="https://mechu.app"

run_with_build_env() {
  NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-$default_site_url}" "$@"
}

run_fast() {
  npx tsc --noEmit
}

run_standard() {
  npx tsc --noEmit
  run_with_build_env npm run build
}

run_multi() {
  npx tsc --noEmit
  run_with_build_env npm run build
  run_with_build_env npm run cf:build

  if npm pkg get scripts.test:e2e 2>/dev/null | rg -qv 'null'; then
    npm run test:e2e
  else
    echo "No test:e2e script configured; skipping e2e execution."
  fi
}

case "$lane" in
  fast) run_fast ;;
  standard) run_standard ;;
  multi) run_multi ;;
  *)
    echo "Unknown lane: $lane"
    echo "Usage: .agents/scripts/run-quality-gate.sh [fast|standard|multi]"
    exit 1
    ;;
esac
