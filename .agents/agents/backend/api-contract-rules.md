# API Contract Rules

- Preserve response compatibility for `/api/recommendations` unless ticket explicitly allows breaking changes.
- Validate lat/lng/mode/country inputs.
- Keep provider timeout handling and fallback paths explicit.
- Event logging must stay non-blocking for UX.
