# Branch Protection Setup (Manual)

GitHub UI path:
- Repository -> Settings -> Branches -> Add branch protection rule

Target branch:
- `main`

Enable:
- Require a pull request before merging
- Require approvals
- Require status checks to pass before merging

Required status checks to add:
- `quality-gate`

Notes:
- The workflow file is `.github/workflows/agent-quality-gate.yml`.
- Lane is auto-detected by `.agents/scripts/detect-lane.sh`.
- Gate execution is `.agents/scripts/run-quality-gate.sh <lane>`.
