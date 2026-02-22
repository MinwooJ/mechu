# MECHU Prerender / Rendering Strategy (P0)

작성일: 2026-02-22 (KST)
대상 플랫폼: Next.js App Router + OpenNext Cloudflare + Cloudflare Workers

## 1) 목표

- locale 핵심 경로를 빌드 타임에 prerender(SSG)하여 초기 HTML 품질과 크롤링 안정성을 높인다.
- 세션/위치 의존 로직은 기존처럼 클라이언트에서 수행한다.
- OpenNext Cloudflare 제약(ISR/캐시)을 고려해 운영 가능한 전략만 적용한다.

## 2) 공식 문서 조사 요약

### Next.js (App Router)

- `generateStaticParams`는 빌드 타임에 동적 세그먼트 파라미터를 생성할 때 사용한다.
- `dynamicParams = false`를 함께 사용하면 정의되지 않은 동적 파라미터 요청을 404 처리할 수 있다.
- Route Segment Config의 `dynamic`으로 정적/동적 렌더링 의도를 명시할 수 있다.

참고:
- https://nextjs.org/docs/app/api-reference/functions/generate-static-params
- https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config
- https://nextjs.org/docs/app/building-your-application/rendering

### OpenNext Cloudflare

- 기본 SSR 라우트는 추가 설정 없이 동작한다.
- 동적 라우트의 incremental cache/ISR류 동작은 Cloudflare Cache API/Queue/DO 기반 설정에 의존한다.
- Static Assets를 사용하는 Workers 런타임에서는 정적 자산 재검증(revalidation)이 지원되지 않는 제약이 있다.

참고:
- https://opennext.js.org/cloudflare
- https://opennext.js.org/cloudflare/caching

### Cloudflare Next.js 가이드

- Cloudflare는 Next.js의 대부분 기능을 지원하며, 공식 가이드 기준으로 OpenNext 어댑터 사용을 권장한다.

참고:
- https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/

### Google Search (렌더링/인덱싱)

- JS SEO 기본 원칙: 초기 응답 HTML에서 핵심 정보(title/description/headings)를 제공하는 것이 안전하다.
- 크롤링 예산 관점: 의미 없는 URL/상태 페이지의 인덱싱은 낭비가 될 수 있어 제어가 필요하다.

참고:
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://developers.google.com/search/docs/crawling-indexing/large-site-managing-crawl-budget

## 3) 현재 경로별 최종 렌더링 전략

| 경로 | 최종 모드 | 근거 |
|---|---|---|
| `/{locale}` | SSG (`generateStaticParams`) + redirect | locale 세그먼트가 고정 4종, 빌드 타임 생성 가능 |
| `/{locale}/onboarding` | SSG Shell + Client Hydration | 초기 UI/메타는 정적, 위치 권한/직접입력은 클라이언트 전용 |
| `/{locale}/preferences` | SSG Shell + Client Hydration | 필터 UI 자체는 정적 가능, 실제 상태는 sessionStorage 기반 |
| `/{locale}/results` | SSG Shell + Client Data Fetch (Hybrid) | 추천 API/세션 의존 로직은 CSR, 초기 HTML은 정적 메타/구조 제공 |
| `/{locale}/status` | SSG Shell + Query 기반 Client 분기 | 상태 페이지는 인덱싱 대상 아님(noindex), UI는 정적 제공 |
| `/` | Static redirect | locale 없는 진입점 fallback. 실서비스는 middleware가 우선 locale 리다이렉트 처리 |
| `/onboarding` `/preferences` `/results` `/status` | Static redirect | 레거시 호환 경로. locale 경로로 유도 |
| `/api/*` | Dynamic (Edge SSR) | 외부 API/입력 값/실시간 응답 의존 |
| `/robots.txt` `/sitemap.xml` | Static | metadata route로 정적 생성 |

## 4) 이번 코드 반영 내용

### A. locale prerender 강제

- `app/[locale]/layout.tsx`
  - `generateStaticParams()` 추가 (`ko`, `en`, `ja`, `zh-Hant`)
  - `dynamicParams = false` 추가
- `lib/i18n/static-params.ts`
  - locale static params 공용 유틸 추가

### B. 페이지별 렌더링 모드 명시

- `app/[locale]/page.tsx`
- `app/[locale]/onboarding/page.tsx`
- `app/[locale]/preferences/page.tsx`
- `app/[locale]/results/page.tsx`
- `app/[locale]/status/page.tsx`
  - 공통으로 `export const dynamic = "force-static"` 적용

### C. 레거시 경로 분리

- 기존 클라이언트 구현 파일을 아래로 분리:
  - `app/onboarding/onboarding-client.tsx`
  - `app/preferences/preferences-client.tsx`
  - `app/results/results-client.tsx`
  - `app/status/status-client.tsx`
- 레거시 route 파일(`app/onboarding/page.tsx` 등)은 정적 redirect 전용으로 전환
- locale wrapper는 분리된 client 구현 파일을 import하도록 변경

## 5) 인덱싱 품질 점검 결과

### 핵심 HTML 요소

- locale 페이지별 `<title>`, `<meta description>`, canonical/hreflang이 서버 HTML에 포함된다.
- `status` 페이지는 기존 정책대로 `noindex, nofollow` 유지한다.

### 로딩/오류 상태

- `results`는 클라이언트 로딩 오버레이를 사용하며, 초기 HTML 자체는 정적 shell을 제공한다.
- 추천 API 실패/지원 불가/빈 결과는 `/{locale}/status?kind=...`로 이동한다.
- 상태 안내 페이지를 인덱싱에서 제외하여 soft-404 성격 페이지 노출을 최소화한다.

### Googlebot 응답 안정성

- prerender된 locale 경로는 일반 브라우저 UA와 Googlebot UA 모두 동일한 초기 HTML을 받을 수 있는 구조다.
- 지도/추천 데이터는 JS 실행 후 하이드레이션되지만, 크롤러에 필요한 페이지 주제/메타는 서버 HTML에서 제공된다.

## 6) ISR / Revalidate 정책

- P0에서는 ISR(`revalidate`)을 명시적으로 도입하지 않는다.
- 사유:
  - 현재 핵심 페이지가 세션/위치 기반 CSR 중심이며, 정적 shell만으로 목적 달성이 가능하다.
  - OpenNext Cloudflare의 재검증/캐시 백엔드 구성은 별도 운영 설계(P1 캐시 전략)로 분리하는 것이 안전하다.

## 7) 검증 체크리스트

- `npx tsc --noEmit`
- `npm run build`
- `npm run cf:build`
- `npm run test:e2e`
- 빌드 라우트 분류에서 locale 경로가 `● (SSG)`인지 확인
- `curl`/브라우저 view-source로 locale 페이지 메타 태그 확인

## 8) 알려진 리스크 / 후속

- locale가 늘어날 경우 `generateStaticParams` 대상 확장 필요
- SSR/ISR 캐시 전략은 트래픽 증가 시점에 Cloudflare KV/R2/Cache 조합으로 별도 수립
- status 외에 인덱싱 제외가 필요한 내부 상태성 URL이 생기면 noindex 정책을 즉시 확장
