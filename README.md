# mechu (점메추/저메추)

위치 기반으로 점심/저녁 맛집 Top3를 추천하는 웹 서비스입니다.

- 웹 우선 출시 (Next.js App Router)
- 1차 글로벌 출시, 한국(KR) 위치는 Kakao Local 우선
- 익명 사용(로그인 없음)
- 배포 타깃: Cloudflare Workers(OpenNext)

## 핵심 기능

1. 온보딩
- 현재 위치 권한 허용
- 직접 입력(주소/도시/좌표) + 지도에서 핀 선택

2. 선호 설정
- 식사 시간대: 점심/저녁
- 반경: 100m~3km (프리셋 + 슬라이더)
- 바이브: 안전빵 / 요즘 핫한 / 모험가

3. 결과
- Top3 추천 카드
- 모바일 바텀시트 스냅(접힘/중간)
- 지도에서 내 기준 위치 + 추천 포인트 표시
- 한국: 카카오/네이버 지도 보기
- 해외: 구글 지도 보기

4. 익명 이벤트 기록
- D1 저장 필드: `ts`, `event_type`, `session_id`, `mode`, `ip_country`, `search_country`

## 국가/데이터 소스 정책

- 검색 기준 국가(`countryCode`)가 `KR`이고 `KAKAO_REST_API_KEY`가 있으면 Kakao Local API를 우선 사용
- KR에서 Kakao 결과가 없으면 Google Places로 폴백
- KR이 아니면 Google Places 사용
- 지도 렌더링은 `countryCode=KR` + `NEXT_PUBLIC_KAKAO_MAP_API_KEY`일 때 Kakao Map, 그 외 OSM(Leaflet)

## 추천 로직 요약

자세한 내용: `docs/recommendation-algorithm.md`

- 반경 필터로 후보군 제한
- 바이브별 가중치 점수 계산(평점/인기도/노출 다양성 등)
- 가중 랜덤 + 카테고리 다양성 페널티로 TopN 선택
- 거리 점수는 랭킹에 직접 사용하지 않고 반경 필터로만 사용

## 다국어(i18n)

- 지원 언어: `ko`, `en`, `ja`, `zh-Hant`
- URL 전략: locale prefix (`/ko/...`, `/en/...`, `/ja/...`, `/zh-Hant/...`)
- 기본 언어: `en`
- 감지 우선순위:
  1. URL locale
  2. `NEXT_LOCALE` 쿠키
  3. 브라우저 `Accept-Language`
  4. IP 국가(`CF-IPCountry` / `request.geo.country`)
  5. `en` fallback
- IP 국가 매핑:
  - `KR -> ko`
  - `JP -> ja`
  - `TW/HK/MO -> zh-Hant`
  - 그 외 `en`
- 언어 스위처:
  - 헤더에 단일 언어 버튼 노출
  - 데스크톱: 팝오버 메뉴
  - 모바일: 하단 오버레이 메뉴
- 핵심 파일:
  - `middleware.ts`
  - `lib/i18n/config.ts`
  - `lib/i18n/messages.ts`
  - `lib/i18n/messages/ko.json`, `lib/i18n/messages/en.json`
  - `lib/i18n/messages/ja.json`, `lib/i18n/messages/zh-Hant.json`

## 기술 스택

- Next.js 15 (App Router)
- TypeScript
- React 19
- Leaflet / React-Leaflet
- Kakao Maps JS SDK
- OpenNext + Wrangler (Cloudflare Workers)
- Cloudflare D1

## 프로젝트 구조

```text
app/
  [locale]/
    onboarding/
    preferences/
    results/
    status/
  api/
    availability/
    recommendations/
    events/
    geocode/
  onboarding/
  preferences/
  results/
  status/
  components/
lib/
  flow/
  reco/
  i18n/
migrations/
docs/
public/
```

## 환경 변수

`.env.local.example`를 복사해 `.env.local` 생성:

```bash
cp .env.local.example .env.local
```

필수/권장 변수:

- `GOOGLE_MAPS_API_KEY` (권장)
  - Google Places/Geocoding 사용
- `KAKAO_REST_API_KEY` (KR 서비스 권장)
  - Kakao Local 검색 데이터
- `NEXT_PUBLIC_KAKAO_MAP_API_KEY` (KR 지도 렌더링)
  - 브라우저에서 Kakao Map SDK 로드

옵션:

- `RECO_DEFAULT_LIMIT` (기본 8)
- `RECO_MAX_LIMIT` (기본 20)
- `RECO_UNSUPPORTED_COUNTRIES` (쉼표 구분, 예: `CU,IR`)
- `RECO_PROVIDER_TIMEOUT_MS` (기본 8000)
- `GEOCODE_TIMEOUT_MS` (기본 8000)
- `RECO_EVENTS_LOG_PATH` (로컬 fallback 로그 경로)

## 로컬 실행

```bash
npm install
npm run dev
```

- 기본 주소: `http://localhost:3000`
- `dev` 스크립트는 `.next-dev`를 사용합니다. (`build`의 `.next`와 분리)

### 자주 발생하는 로컬 오류

`Cannot find module './xxx.js'`가 뜨면:

```bash
rm -rf .next-dev .next-e2e .next
npm run dev
```

권장: `next dev` 실행 중에는 `next build`를 동시에 돌리지 않습니다.

## API

### GET `/api/availability`

Query:
- `country_code` (optional)

Response:

```json
{ "supported": true, "reason": null }
```

### POST `/api/recommendations`

Body(주요 필드):

```json
{
  "lat": 37.5665,
  "lng": 126.978,
  "mode": "lunch",
  "radius_m": 1000,
  "randomness_level": "balanced",
  "country_code": "KR",
  "session_id": "..."
}
```

Response status:
- `ok`
- `unsupported_region`
- `source_error`

### POST `/api/events`

Body(현재 사용):

```json
{
  "event_type": "impression",
  "session_id": "...",
  "mode": "lunch",
  "search_country": "KR"
}
```

## D1 설정

1. DB 생성

```bash
npx wrangler d1 create mechu
```

2. `wrangler.jsonc`의 `database_id` 반영

3. 마이그레이션 적용

```bash
npx wrangler d1 migrations apply mechu --remote
```

## Cloudflare 배포

```bash
npm run deploy
```

- `deploy` 스크립트는 `opennextjs-cloudflare build` 후 `wrangler deploy`를 실행합니다.
- `wrangler.jsonc`의 엔트리는 `.open-next/worker.js`입니다.

## 문서

- 추천 알고리즘: `docs/recommendation-algorithm.md`
- 바이브 설계안(확장): `docs/vibe-recommendation-design.md`
- 아키텍처/운영 가이드: `docs/architecture.md`
- i18n 운영 가이드: `docs/i18n-guide.md`
- AI 작업 가이드: `CLAUDE.md`
