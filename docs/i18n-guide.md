# i18n Guide (P0)

## Scope
- Locales: `ko`, `en`
- URL strategy: locale prefix (`/ko/...`, `/en/...`)
- Default locale: `en`
- Locale detection: `NEXT_LOCALE` cookie -> `Accept-Language` -> fallback `en`

## Routing
- Middleware: `/middleware.ts`
  - Non-locale path is redirected to locale-prefixed path.
  - `/` redirects to `/{locale}/onboarding`.
- Locale segment wrappers:
  - `app/[locale]/onboarding/page.tsx`
  - `app/[locale]/preferences/page.tsx`
  - `app/[locale]/results/page.tsx`
  - `app/[locale]/status/page.tsx`

## Translation Resources
- Files:
  - `lib/i18n/messages/ko.json`
  - `lib/i18n/messages/en.json`
- Access helpers:
  - `lib/i18n/client.ts`: `useT`, `useLocale`, `useLocaleHref`
  - `lib/i18n/messages.ts`: dictionary lookup/interpolation

## Key Naming Rules
- Dot notation by domain:
  - `onboarding.*`
  - `preferences.*`
  - `results.*`
  - `status.*`
  - shared: `common.*`, `flow.*`, `mode.*`
- Use placeholders for dynamic values:
  - Example: `"results.cardMatch": "#{rank} MATCH"`
  - Usage: `t("results.cardMatch", { rank: 1 })`

## UI Rules
- New user-facing string must be added to both `ko.json` and `en.json`.
- Do not hardcode user-facing strings in page components.
- Keep copy length mobile-safe (single-line button labels preferred).

## Adding New Locale
1. Add locale to `LOCALES` in `lib/i18n/config.ts`.
2. Add message file `lib/i18n/messages/<locale>.json`.
3. Register dictionary import in `lib/i18n/messages.ts`.
4. Update middleware detection logic if needed.
5. Run validation suite.

## Validation
- Type check: `npx tsc --noEmit`
- Build: `npm run build`
- Cloudflare build: `npm run cf:build`
- E2E smoke:
  - `tests/e2e/smoke.spec.ts`
  - `tests/e2e/i18n.spec.ts`
  - `tests/e2e/results-mobile-sheet.spec.ts`
