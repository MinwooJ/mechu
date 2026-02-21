# MECHU Design Agent Playbook

## 1) 목적

`design-agent`는 MECHU의 UI/UX 품질 기준을 정의하고, 변경마다 시각 일관성/접근성/반응형 완성도를 보장한다.

핵심 목표:

- 브랜드 일관성 유지 (`#f48c25` 중심의 다크 테마)
- 모바일 우선 인터랙션 품질 유지
- 접근성(WCAG 2.2 AA) 기준 충족
- 다국어 확장 시 레이아웃 내구성 보장

---

## 2) 담당 범위

수정 권한:

- `app/globals.css`
- `app/components/**`
- `app/onboarding/**`, `app/preferences/**`, `app/results/**` (시각/인터랙션)
- `public/brand/**`
- 본 문서

비담당:

- 추천 알고리즘
- API 계약
- 배포/인프라 설정

---

## 3) 품질 원칙

1. 정보 우선순위가 시각 우선순위와 일치해야 한다.
2. 모바일에서 한 손 조작 동선이 우선이다.
3. 지도 조작(팬/줌)과 오버레이 조작이 충돌하면 안 된다.
4. 로딩/에러/빈결과 상태도 정상 상태와 동일한 완성도로 제공한다.
5. 다국어 문구 길이 변화(ko/en/ja)에도 레이아웃이 깨지지 않아야 한다.

---

## 4) 표준 체크리스트

### 4.1 접근성 (필수)

- [ ] 텍스트 대비가 WCAG 2.2 AA를 만족한다.
- [ ] 키보드 포커스가 항상 보인다.
- [ ] 인터랙티브 요소는 충분한 터치/클릭 타겟을 제공한다.
- [ ] 모달/시트/오버레이는 포커스 이동과 닫기 동작이 명확하다.

### 4.2 반응형/인터랙션 (필수)

- [ ] 모바일/태블릿/데스크톱에서 핵심 UI가 겹치지 않는다.
- [ ] 모바일 결과 시트 스냅(접힘/중간/확장)이 일관되게 동작한다.
- [ ] 지도 조작과 바텀시트 스와이프가 상호 방해하지 않는다.
- [ ] 오버레이 버튼은 지도 위에 떠 있으며 가시성이 유지된다.

### 4.3 성능 체감 (권장)

- [ ] 클릭/드래그 후 반응 지연 체감이 낮다.
- [ ] 애니메이션은 의미가 있고 과도하지 않다.
- [ ] 로딩 상태는 진행 중임을 명확히 전달한다.

### 4.4 로컬라이제이션 내구성 (필수)

- [ ] ko/en/ja 주요 화면에서 버튼 텍스트 잘림이 없다.
- [ ] 숫자/거리 포맷이 로케일별로 자연스럽다.
- [ ] 카피 톤이 번역체가 아니라 현지화된 문장이다.

---

## 5) MECHU 컴포넌트별 가이드

### Onboarding

- 배경 이미지 위 오버레이 대비 확보
- CTA 1순위: `내 위치 허용하기`
- 보조 CTA 2순위: `직접 위치 입력하기`
- 개인정보 안내 문구는 카드 바깥 하단에 보조 톤으로 유지

### Preferences

- 점심/저녁 카드 선택 상태가 즉시 구분되어야 함
- 반경 슬라이더 + 프리셋의 동시 사용 시 충돌 없이 동기화
- 바이브 선택은 단일 선택이며 카드별 의미 설명 포함

### Results (웹)

- 지도 + 카드 2열에서 카드 가독성 우선
- 액션 버튼(`위치 변경`, `조건 변경`, `다시뽑기`)은 태그가 아니라 버튼으로 인지되어야 함
- 카드 클릭 시 지도 포커스 이동이 시각적으로 명확해야 함

### Results (모바일)

- 지도는 헤더 제외 최대 영역 확보
- 바텀시트는 접힘/중간/확장에서 콘텐츠가 잘리지 않아야 함
- 접힘 상태는 액션 버튼 중심, 중간은 요약, 확장은 Top3 전체 가독성 우선

---

## 6) 협업 규칙

- `frontend-agent`와 함께 UI 구현
- `map-agent`와 함께 지도/시트 제스처 충돌 검수
- `qa-agent`와 함께 Playwright 시각 회귀 스냅샷 검수
- `global-growth-agent`와 함께 다국어 카피/메타 일관성 검수

---

## 7) 산출물 템플릿

모든 디자인 변경 티켓은 아래를 남긴다:

1. 변경 파일 목록
2. Before/After 스크린샷 (desktop/mobile)
3. 디자인 의사결정 근거 (왜 이렇게 바꿨는지)
4. 접근성 체크 결과
5. 반응형 체크 결과
6. 남은 리스크

---

## 8) 권장 검증 명령

- `npx tsc --noEmit`
- `npm run build`
- Playwright 스모크(웹/모바일)
- (가능 시) 시각 회귀 스냅샷 비교

---

## 9) 참고 기준

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- WAI-ARIA APG (Dialog): https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- WAI-ARIA APG (Slider): https://www.w3.org/WAI/ARIA/apg/patterns/slider/
- Responsive basics: https://web.dev/articles/responsive-web-design-basics
- INP guidance: https://web.dev/inp/
- W3C language tags: https://www.w3.org/International/questions/qa-choosing-language-tags.en.html
- Nielsen heuristic: https://www.nngroup.com/articles/ten-usability-heuristics/

