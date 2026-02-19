# Meal Recommendation Web (TypeScript)

Location-based lunch/dinner recommendation MVP.

## Current status
- Frontend MVP exists (`app/page.tsx`): location permission, lunch/dinner toggle, recommendation list UI, exclude action, Google Maps directions link.
- Backend MVP exists (`app/api/*`): availability, recommendations, anonymous events.

## Stack
- Next.js (App Router)
- TypeScript
- API Route Handlers
- Cloudflare Workers deployment via OpenNext

## Local run
```bash
npm install
npm run dev
```

Open: <http://127.0.0.1:3000>

## API
- GET `/api/availability`
- POST `/api/recommendations`
- POST `/api/events`

## Env
Copy `.env.local.example` to `.env.local`.

`GOOGLE_MAPS_API_KEY`를 설정하면 추천 결과에 실제 가게명이 표시됩니다.
키가 없거나 Places 호출이 실패하면 mock 데이터(`... spot N`)로 자동 fallback 됩니다.

## Cloudflare deployment

1. Authenticate Wrangler
```bash
npx wrangler login
```

2. Build Cloudflare worker bundle
```bash
npm run cf:build
```

3. Local worker preview
```bash
npm run preview
```

4. Deploy
```bash
npm run deploy
```

## Notes
- `wrangler.jsonc` uses `.open-next/worker.js` as the worker entry.
- The project is configured with `nodejs_compat`.
