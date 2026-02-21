# i18n Guide (P0)

## Scope
- Locales: `ko`, `en`, `ja`, `zh-Hant`
- URL strategy: locale prefix (`/ko/...`, `/en/...`, `/ja/...`, `/zh-Hant/...`)
- Default locale: `en`
- Locale detection priority:
  1. URL locale segment
  2. `NEXT_LOCALE` cookie
  3. `Accept-Language`
  4. IP country (`CF-IPCountry` / `request.geo.country`)
  5. fallback `en`

## Routing
- Middleware: `/middleware.ts`
  - Non-locale path is redirected to locale-prefixed path.
  - `/` redirects to `/{locale}/onboarding`.
  - Locale alias is normalized to canonical segment.
    - Example: `/zh-hant/...` -> `/zh-Hant/...`
- Locale segment wrappers:
  - `app/[locale]/onboarding/page.tsx`
  - `app/[locale]/preferences/page.tsx`
  - `app/[locale]/results/page.tsx`
  - `app/[locale]/status/page.tsx`

## Translation Resources
- Files:
  - `lib/i18n/messages/ko.json`
  - `lib/i18n/messages/en.json`
  - `lib/i18n/messages/ja.json`
  - `lib/i18n/messages/zh-Hant.json`
- Access helpers:
  - `lib/i18n/client.ts`: `useT`, `useLocale`, `useLocaleHref`
  - `lib/i18n/messages.ts`: dictionary lookup/interpolation
  - `lib/i18n/config.ts`: locale parsing and native labels

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
- New user-facing string must be added to all locale resources.
- Do not hardcode user-facing strings in page components.
- Keep copy length mobile-safe (single-line button labels preferred).
- Language switcher UX:
  - Show one toggle button in header.
  - Desktop: popover menu.
  - Mobile: bottom overlay menu.
  - Keep current route context on locale switch.

## IP Country Mapping
- `KR` -> `ko`
- `JP` -> `ja`
- `TW` / `HK` / `MO` -> `zh-Hant`
- others -> `en`
- Special values (`XX`, `T1`) are treated as unknown and fallback.

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
