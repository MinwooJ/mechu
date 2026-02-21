#!/usr/bin/env bash
set -euo pipefail

lane="${1:-fast}"

run_fast() {
  npx tsc --noEmit
}

run_standard() {
  npx tsc --noEmit
  npm run build
}

run_multi() {
  npx tsc --noEmit
  npm run build
  npm run cf:build
  echo "Run Playwright smoke separately: npm run test:e2e (if configured)"
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
