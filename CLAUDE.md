# CLAUDE.md

이 문서는 새로운 AI 세션(또는 새 개발자)이 `mechu` 프로젝트를 빠르게 이해하고,
기존 의도와 품질을 유지하며 작업하도록 돕는 실무 가이드입니다.

## 1. 프로젝트 목표

- 서비스명: **mechu**
- 핵심 가치: 위치 기반 점메추/저메추 Top3 추천
- 제품 원칙:
  - 로그인 없이 즉시 사용
  - 추천은 빠르고 단순해야 함
  - 한국(KR) 사용성 최적화 (Kakao 우선)

## 2. 현재 사용자 플로우

1. `/onboarding`
- 위치 권한 허용 또는 직접 위치 입력
- 직접 입력은 텍스트 검색 + 지도 핀 선택

2. `/preferences`
- 점심/저녁 선택
- 반경 선택(100m~3km)
- 바이브 선택(안전빵/요즘 핫한/모험가)

3. `/results`
- Top3 카드 + 지도
- 모바일: 지도 + 바텀시트 스냅(접힘/중간)
- 액션: 위치 변경 / 조건 변경 / 다시뽑기

4. `/status`
- 위치권한 필요, 미지원 지역, 빈 결과, 일반 오류 상태 처리

## 3. 데이터/공급자 분기 규칙 (중요)

- 기준은 **검색 기준 국가(`countryCode`)**
- `KR` + `KAKAO_REST_API_KEY`:
  - Kakao Local API 우선
  - 결과가 없으면 Google Places 폴백
- 그 외:
  - Google Places 사용

지도 렌더링:
- `countryCode=KR` + `NEXT_PUBLIC_KAKAO_MAP_API_KEY` -> Kakao Map
- 그 외 -> OSM(Leaflet)

외부 지도 링크:
- KR 카드: Kakao place 링크 + Naver 검색 링크
- Non-KR 카드: Google place 링크

## 4. UI/UX 가이드 (반드시 준수)

### 비주얼 시스템

- 브랜드 컬러
  - Primary: `#f48c25`
  - Primary accent: `#ffb25f`
- 기본 폰트: `Epilogue`, `Noto Sans KR`
- 다크 톤 배경 + 오렌지 포인트 유지

### 컴포넌트/레이아웃 원칙

- 헤더는 `FlowHeader` 재사용
- 온보딩은 풀스크린 이미지 + 오버레이 카드 구조 유지
- 결과 페이지는
  - 데스크톱: 지도 + 카드 2열
  - 모바일: 지도 위 바텀시트(손가락 영역 조작 가능)

### 모바일 상호작용 원칙

- 지도 터치 이동을 막지 말 것
- 바텀시트 상단 그랩바/헤더는 스크롤 시에도 접근 가능해야 함
- 액션 버튼 텍스트는 명확해야 함
  - `위치 변경`, `조건 변경`, `다시뽑기`

## 5. 프론트엔드 구현 가이드

- 프레임워크: Next.js App Router
- 지도 관련 컴포넌트는 `dynamic(..., { ssr: false })` 유지
- 클라이언트 상태 키:
  - `FLOW_KEY = meal_reco_flow_state_v1`
  - `SESSION_KEY = meal_reco_session_id`
- 국가 판단 함수(`inferSearchCountry`)는 온보딩/결과 양쪽에서 동작 일치 필요

주의:
- 결과 성공 후 이벤트 로깅 실패로 UX를 깨뜨리지 말 것
- 이벤트 전송은 비차단(non-blocking) 유지

## 6. 백엔드 구현 가이드

주요 API:
- `/api/availability`
- `/api/recommendations`
- `/api/events`
- `/api/geocode`

### 안정성 규칙

- 외부 API 호출은 타임아웃 필수
  - `RECO_PROVIDER_TIMEOUT_MS`
  - `GEOCODE_TIMEOUT_MS`
- 입력 검증 강화 유지
  - recommendations: lat/lng finite, mode 화이트리스트
  - events: event_type/mode/session_id/countryCode 검증

### 추천 로직 규칙

- 반경은 **하드 필터**로 사용
- 점수 계산은 바이브 중심
- 최종 선택은 가중 랜덤 + 카테고리 다양성 페널티
- 일일 쿼터는 현재 **사용하지 않음**

## 7. 이벤트/개인정보 정책

D1 저장 컬럼:
- `ts`, `event_type`, `session_id`, `mode`, `ip_country`, `search_country`

원칙:
- 정밀 위치(`lat/lng`)는 현재 D1에 저장하지 않음
- 익명 분석 목적 외 추가 식별자 저장 금지

## 8. 배포/운영 가이드

- 배포 타깃: Cloudflare Workers(OpenNext)
- 명령:
  - `npm run cf:build`
  - `npm run deploy`
- D1 마이그레이션:
  - `npx wrangler d1 migrations apply mechu --remote`

주의:
- 로컬에서 `next dev`와 `next build`를 동시에 돌리면 `.next` 모듈 불일치 오류가 날 수 있음

## 9. 변경 전 체크리스트

1. 한국/해외 분기 로직이 깨지지 않았는가?
2. 모바일 지도 터치 이동/줌이 동작하는가?
3. 결과 페이지 바텀시트 스냅이 정상인가?
4. 이벤트 API 실패가 사용자 플로우를 막지 않는가?
5. `npx tsc --noEmit` 통과하는가?
6. `npm run cf:build` 통과하는가?

## 10. 참고 문서

- `README.md`
- `docs/architecture.md`
- `docs/recommendation-algorithm.md`
- `docs/vibe-recommendation-design.md`
