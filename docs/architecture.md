# MECHU Architecture

## 1. 시스템 개요

`mechu`는 Next.js App Router 기반의 단일 애플리케이션입니다.

- FE 화면 + API 라우트가 한 프로젝트에 공존
- Cloudflare Workers(OpenNext)로 단일 배포
- 이벤트 로그는 Cloudflare D1에 저장

## 2. 런타임 구성

- UI Route
  - `/onboarding`
  - `/preferences`
  - `/results`
  - `/status`
- API Route
  - `GET /api/availability`
  - `POST /api/recommendations`
  - `POST /api/events`
  - `GET /api/geocode`

## 3. 요청 흐름

### 3.1 추천 조회 흐름

1. 클라이언트(`/results`)가 `flow state`를 읽음
2. `/api/availability` 호출로 국가 지원 여부 확인
3. `/api/recommendations` 호출
4. 서버(`lib/reco/service.ts`)에서 국가/키 상태에 따라 공급자 선택
5. 후보 필터링 + 점수 계산 + 가중 랜덤으로 추천 반환
6. 클라이언트가 Top3 렌더링
7. `/api/events`에 `impression` 비동기 기록

### 3.2 위치 검색 흐름

1. 온보딩/결과 위치 변경 모달에서 텍스트 입력
2. `/api/geocode?q=...` 호출
3. Google Geocoding 결과를 좌표로 반영
4. 사용자가 지도 핀 위치를 최종 조정

## 4. 국가/지도 분기

### 데이터 공급자

- `countryCode=KR` + `KAKAO_REST_API_KEY`:
  - Kakao Local 우선
  - 실패/빈 결과 시 Google 폴백
- 기타 국가:
  - Google Places

### 지도 렌더링

- `countryCode=KR` + `NEXT_PUBLIC_KAKAO_MAP_API_KEY`:
  - Kakao Map SDK
- 그 외:
  - OSM(Leaflet)

## 5. 상태 저장

### 브라우저 로컬 상태

- `meal_reco_flow_state_v1`
  - `countryCode`, `mode`, `radius`, `randomness`, `position`
- `meal_reco_session_id`
  - 익명 세션 UUID

## 6. 이벤트 로그

### D1 테이블: `reco_events`

- `id` (PK)
- `ts`
- `event_type`
- `session_id`
- `mode`
- `ip_country`
- `search_country`

참고:
- D1 연결 실패 시 로컬 파일 로그 fallback (`RECO_EVENTS_LOG_PATH`)

## 7. 성능/안정성 포인트

- 외부 API 호출 타임아웃 적용
  - `RECO_PROVIDER_TIMEOUT_MS`
  - `GEOCODE_TIMEOUT_MS`
- 추천 결과 성공 후 이벤트 기록은 non-blocking 처리
- 추천 일일 쿼터는 현재 비활성화

## 8. 배포

- `npm run cf:build`
- `npm run deploy`

OpenNext가 `.open-next/worker.js`를 생성하고 Wrangler가 배포합니다.
