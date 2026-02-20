# MECHU Vibe Recommendation Design (API-based)

Date: 2026-02-20  
Scope: "안전빵 / 요즘 핫한 / 모험가"를 실제 신호 기반으로 추천하도록 설계

## 1) Feasibility Summary

### 결론

- 구현 가능: **예**
- 단, 국가/공급자별 데이터 밀도 차이로 정확도는 다름
- 한국(KR)은 Kakao 단독으로는 분위기(바이브) 신호가 부족해서 보강 설계가 필요

## 2) API Capability Check

### Google Places API (New)

사용 가능한 신호(대표):

- 품질/인기도: `rating`, `userRatingCount`, `priceLevel`
- 운영상태: `currentOpeningHours`, `regularOpeningHours`, `businessStatus`
- 분위기/속성(Atmosphere 계열):  
  `goodForGroups`, `liveMusic`, `outdoorSeating`, `reservable`, `servesCoffee`, `servesDinner`,
  `reviews`, `reviewSummary`, `editorialSummary`, `generativeSummary` 등
- 카테고리/타입 필터: `includedTypes`, `includedPrimaryTypes`, `excludedTypes`

주의:

- Atmosphere 필드는 더 높은 SKU(Enterprise + Atmosphere)로 과금
- AI 요약 필드는 지역/언어 가용성 제한이 있음

### Kakao Local API

확인 가능한 필드(대표):

- `place_name`, `category_name`, `address_name`, `road_address_name`, `x/y`, `distance`, `place_url`, `phone`

제한:

- 공개 응답에 `rating`, `opening_hours`, `reviewSummary` 같은 바이브 핵심 신호가 없음

## 3) Cost / Free-Tier Considerations

### Google (2025-03-01 이후)

- 월 $200 크레딧 구조에서 **SKU별 free usage cap** 구조로 전환됨
- Places API (New)에서
  - Nearby Search Pro: free cap 5,000
  - Nearby Search Enterprise: free cap 1,000
  - Nearby Search Enterprise + Atmosphere: free cap 1,000

### Kakao

- 로컬 API 일간 쿼터:
  - 카테고리 검색 100,000
  - 키워드 검색 100,000
- 무료 제공량 초과 시 유료 과금 정책 존재

## 4) Product Definition: "Real Vibe"

현재의 랜덤 강도 중심이 아니라, 아래처럼 **신호 기반 점수**로 전환:

- 안전빵: 검증도/안정성 중심
- 요즘 핫한: 인기/활기/트렌드 중심
- 모험가: 신선도/다양성/탐험성 중심

## 5) Feature Model

### 공통 피처

- `f_rating`: 평점 정규화
- `f_popularity`: 리뷰 수(혹은 대체 지표) 정규화
- `f_open`: 현재 영업 여부
- `f_price_fit`: 사용자 예산/선호와의 일치도
- `f_type_fit`: 카테고리/타입 적합도
- `f_distance`: 반경 내에서의 상대 거리(강한 페널티 X)
- `f_novelty`: 최근 노출 이력과의 중복 회피

### Atmosphere 확장 피처 (Google 중심)

- `f_group`: 단체 적합 (`goodForGroups`)
- `f_social`: 활기 지표 (`liveMusic`, `servesCocktails`, `servesBeer`)
- `f_casual`: 가벼운 식사 지표 (`servesCoffee`, `takeout`)
- `f_comfort`: 환경 지표 (`outdoorSeating`, `reservable`)
- `f_text_vibe`: `reviewSummary`/`editorialSummary`의 키워드 점수

## 6) Vibe Scoring (Proposed)

점수는 모두 0~1 정규화 후 가중합:

- `score_safe = 0.30*f_rating + 0.30*f_popularity + 0.20*f_open + 0.10*f_type_fit + 0.10*(1-f_novelty)`
- `score_hot = 0.25*f_popularity + 0.20*f_rating + 0.20*f_social + 0.15*f_text_vibe + 0.10*f_open + 0.10*f_type_fit`
- `score_explore = 0.30*f_novelty + 0.20*f_type_diversity + 0.20*f_text_vibe_unique + 0.15*f_distance_var + 0.15*f_rating`

선택 방식:

1. 해당 vibe score로 정렬
2. 상위 K를 풀로 구성
3. 가중 랜덤 추출(다양성 페널티 적용)로 Top3 생성

## 7) Country Strategy

### KR (권장)

1. 1차 후보군: Kakao category/keyword 검색으로 광범위 리콜
2. 가능 시 2차 보강: Google Nearby/Text + Place Details로 일부 후보 enrich
3. enrich 실패 후보는 proxy score(카테고리/거리/반복노출 회피)로 점수
4. 결과 카드에 **신뢰도 배지** 표시:
   - 높음: rating/opening/atmosphere 신호 충분
   - 중간: rating/opening 일부
   - 낮음: 카테고리/거리 중심 추론

### Non-KR

- Google Places New 중심으로 직접 score 계산
- Atmosphere 필드 사용 여부는 비용 정책/트래픽에 따라 플래그로 제어

## 8) API Call Flow (Recommended)

### Low-cost mode (기본)

- Nearby Search + 최소 필드(`id,displayName,location,primaryType,rating,userRatingCount,priceLevel,currentOpeningHours`)
- Place Details는 Top N(예: 10~20)만 추가 호출

### High-quality mode (옵션)

- Top N에 대해 Atmosphere 필드 포함 Place Details
- `reviewSummary`/`editorialSummary` 기반 텍스트 vibe 점수

## 9) Implementation Plan

### Phase 1 (빠른 적용)

- vibe별 명시 점수 함수 도입
- Google 신호(`rating`, `userRatingCount`, `currentOpeningHours`) 반영
- KR은 Kakao 기반 + proxy 점수
- 결과 이유 텍스트 개선(예: "리뷰 수가 많아 안전빵")

### Phase 2 (정확도 향상)

- Google Atmosphere 필드로 확장
- Top N만 Details 조회 + 캐시(예: 10분)로 비용 제어
- 신뢰도 배지/설명 UI 도입

### Phase 3 (학습형 튜닝)

- 클릭/외부지도 이동/재뽑기 이벤트로 오프라인 튜닝
- 국가별/시간대별 가중치 자동 보정

## 10) Risks and Mitigations

1. 비용 상승:
   - 필드 마스크 최소화
   - Top N만 Details 호출
   - 캐시 + 월 한도 가드레일
2. 국가별 데이터 편차:
   - 신뢰도 레벨 노출
   - KR 전용 보정 규칙 유지
3. 품질 변동:
   - A/B 테스트로 vibe별 만족도 측정

## 11) Decision Recommendation

현 서비스 조건(글로벌 + KR 중요 + 비용 민감)에서 권장안:

1. 지금 바로 Phase 1 적용 (비용 안정)
2. 트래픽/예산 확인 후 Phase 2를 기능 플래그로 점진 적용
3. KPI(클릭률, 재뽑기율, 외부지도 이동률)로 Phase 3 진입 판단

