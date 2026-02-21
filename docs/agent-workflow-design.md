# MECHU 멀티 에이전트 운영 설계

## 1) 목적

MECHU의 개발 속도를 높이되, 반복 이슈(지도 분기 회귀, 모바일 인터랙션 누락, 배포 변수 누락)를 줄이기 위해
`오케스트레이터 + 전문 에이전트` 운영 모델을 표준화한다.

핵심 목표:

- 변경 난이도에 맞는 작업 레인 선택 (Fast/Standard/Multi)
- 병렬 개발 시 충돌 최소화
- 글로벌 확장(i18n/SEO/Ads/정책 준수)까지 커버하는 역할 분리
- 새 AI 세션/새 개발자도 같은 품질로 작업 가능하도록 문서 기반 운영

---

## 2) 현재 코드베이스 기준 도메인 분해

프론트/UI 도메인:

- `app/onboarding/*`
- `app/preferences/*`
- `app/results/page.tsx`
- `app/status/page.tsx`
- `app/components/flow-header.tsx`
- `app/globals.css`

지도 상호작용 도메인:

- `app/results/interactive-map.tsx` (OSM/Leaflet)
- `app/results/kakao-map.tsx` (Kakao)
- `app/onboarding/location-picker.tsx`

API/추천 로직 도메인:

- `app/api/recommendations/route.ts`
- `app/api/geocode/route.ts`
- `app/api/events/route.ts`
- `app/api/availability/route.ts`
- `lib/reco/service.ts`

운영/배포 도메인:

- `wrangler.jsonc`
- `open-next.config.ts`
- `migrations/*`
- `README.md`, `CLAUDE.md`, `docs/*`

---

## 3) 권장 에이전트 토폴로지

초기에는 완전 자율형보다 `Workflow + 제한적 Orchestrator`를 권장한다.
(Anthropic/LangGraph 권고와 동일한 방향)

### A. `orchestrator`

책임:

- 요구사항 분해, 작업 티켓 발급
- 레인(Fast/Standard/Multi) 선택
- 에이전트 산출물 통합/충돌 해결
- 최종 검증 및 머지 승인

산출물:

- 작업 브리프
- 통합 체크리스트
- 릴리즈 노트

### B. `frontend-agent`

책임:

- UI/UX, 반응형, 접근성
- 카피/정보 위계/시각 일관성

수정 권한:

- `app/**` (단, `app/api/**` 제외)
- `public/**`
- `app/globals.css`

### C. `map-agent`

책임:

- Kakao/Leaflet 분기 안정성
- 모바일 터치/팬/줌/포커싱
- 지도 오버레이 충돌 최소화

수정 권한:

- `app/results/interactive-map.tsx`
- `app/results/kakao-map.tsx`
- `app/onboarding/location-picker.tsx`

### D. `backend-agent`

책임:

- 국가 분기(KR/Non-KR), 공급자 폴백
- API 안정성/입력 검증/타임아웃
- 추천 로직 및 이벤트 로깅

수정 권한:

- `app/api/**`
- `lib/reco/**`
- `migrations/**`

### E. `qa-agent`

책임:

- Playwright 회귀 테스트
- 모바일/웹, KR/Non-KR, empty/error 검증
- trace 기반 실패 분석 리포트

수정 권한:

- `tests/**` (신설 권장)
- `playwright.config.*`
- CI test job

### F. `platform-agent`

책임:

- Cloudflare Builds/Workers env-secrets 운영
- Wrangler 배포 옵션(`keep_vars`) 관리
- 운영 문서 정비

수정 권한:

- `wrangler.jsonc`
- `.github/workflows/**`
- 배포 관련 문서

### G. `global-growth-agent` (신규)

역할 정의:

- 다국어(i18n) 설계/현지화 QA
- 검색 노출(SEO/GSC) + Prerender 전략 설계
- Google Ads 정책 준수 점검 및 랜딩 품질 점검
- 국가/언어 확장 우선순위 및 콘텐츠 운영 가이드 제공

수정 권한:

- `app/layout.tsx`, `app/page.tsx`, `app/**/page.tsx` (문구/메타/국제화 구조)
- `app/sitemap.ts`, `app/robots.ts` (도입 시)
- `messages/**` (도입 시)
- `docs/todo-global-launch.md`
- SEO/Ads 운영 문서

### H. `design-agent` (신규)

역할 정의:

- 디자인 시스템 토큰(색/간격/타이포/반경/그림자) 관리
- 컴포넌트 상태(기본/호버/활성/비활성/로딩/에러) 품질 통일
- 모바일 바텀시트/모달/지도 오버레이의 시각·인터랙션 품질 점검
- 접근성 시각 규칙(WCAG 2.2 AA) 충족 여부 1차 게이트 담당
- 로컬라이제이션 길이 변화에 대한 레이아웃 내구성 검수(ko/en/ja 우선)

수정 권한:

- `app/globals.css`
- `app/components/**`
- `app/onboarding/**`, `app/preferences/**`, `app/results/**` (시각/인터랙션 관련)
- `public/brand/**`
- `docs/design-agent-playbook.md`

---

## 4) 레인 기반 운영 (핵심)

자잘한 요청이 많을 때 효율을 위해 기본은 `Fast lane`으로 처리한다.
위험도가 올라가면 `Standard` 또는 `Multi-agent`로 승격한다.

### 4.1 Fast lane (기본)

적용 조건:

- 파일 1~3개
- API 계약/DB/배포 변수 변경 없음
- 지도 분기 로직 핵심 변경 없음
- 30~60분 내 처리 가능

작업 방식:

- 에이전트 1명
- 브랜치 1개
- worktree 추가 없음

검증:

- `npx tsc --noEmit`
- 영향 화면 수동 확인 또는 Playwright 스모크 1개

### 4.2 Standard lane

적용 조건:

- 프론트 + 맵 또는 프론트 + API 경계 변경
- 파일 4~10개
- 기능 영향도 중간

작업 방식:

- 에이전트 2~3명
- 브랜치 1~2개
- 필요 시 worktree 1개 추가

검증:

- `npx tsc --noEmit`
- `npm run build`
- 핵심 E2E 1~2개

### 4.3 Multi-agent lane

적용 조건:

- 지도 공급자 분기/국가 분기/추천 알고리즘/배포 변수/정책 영향 변경
- 회귀 위험 높음

작업 방식:

- orchestrator + 전문 에이전트 병렬
- worktree 기반 분리 권장

검증:

- `npx tsc --noEmit`
- `npm run build`
- `npm run cf:build`
- Playwright 스모크 + 회귀 세트

### 4.4 승격 트리거

아래 조건이 하나라도 있으면 상위 레인으로 승격:

- `countryCode` 기반 분기 수정
- `app/results/kakao-map.tsx` 또는 `app/results/interactive-map.tsx` 수정
- `wrangler.jsonc` 또는 env/secret 정책 수정
- `/api/recommendations` 응답 계약 수정
- Ads/SEO 노출에 영향 있는 URL/메타 변경
- `app/globals.css` 또는 공통 컴포넌트(`app/components/**`)의 디자인 시스템 토큰 변경

---

## 5) 병렬 개발 실행 플로우

### Step 1. Orchestrator가 티켓 발급

각 티켓 필수 항목:

- 목표(Definition of Done)
- 수정 가능 파일 범위
- 금지 범위
- 검증 명령
- 리스크

### Step 2. 작업 수행

- Fast lane: 단일 브랜치에서 바로 수행
- Standard/Multi: 필요 시 `git worktree`로 물리 분리

예시:

```bash
git worktree add ../mechu-fe codex/fe-<topic>
git worktree add ../mechu-map codex/map-<topic>
git worktree add ../mechu-be codex/be-<topic>
```

### Step 3. 에이전트 산출물 제출

공통 제출 포맷:

- 변경 파일 목록
- 설계 의도/트레이드오프
- 실행한 검증 명령과 결과
- 남은 리스크

### Step 4. 통합

- orchestrator가 순차 통합
- 충돌 해결
- 공통 게이트 재실행

---

## 6) GitHub/PR 운영 규칙

브랜치 전략:

- 기본: `main`
- 기능: `codex/<domain>-<topic>`
- 머지: PR만 허용

보호 규칙 권장:

- Require pull request reviews before merging
- Require status checks before merging
- Require conversation resolution before merging
- (규모 증가 시) Merge queue

CODEOWNERS 도입 권장:

```text
# .github/CODEOWNERS
/app/results/* @team-fe @team-map
/app/onboarding/* @team-fe @team-map
/app/api/* @team-be
/lib/reco/* @team-be
/wrangler.jsonc @team-platform
/docs/* @team-platform @team-fe @team-growth
```

---

## 7) 품질 게이트 (Required checks)

필수:

1. `typecheck`

```bash
npx tsc --noEmit
```

2. `build`

```bash
npm run build
```

3. `cf-build`

```bash
npm run cf:build
```

4. `e2e-smoke` (Playwright)

- Web + Mobile viewport
- KR/Non-KR 분기
- 추천 성공/empty/error

Playwright 원칙:

- locator 중심
- 사용자 관점 assertion
- 실패 시 trace 유지(`retain-on-failure`)

---

## 8) Global Growth Agent 상세 운영 규칙

### 8.1 다국어(i18n) 책임

- URL 전략: 서브패스(`/ko`, `/en`, `/ja`) 우선
- 번역 품질: 직역 금지, 현지 UX 카피 기준 적용
- 문자열 관리: 키 누락/중복/미사용 키 점검

출시 게이트:

- 핵심 플로우 100% 번역
- 버튼/에러/상태 문구 로케일 검수 완료
- locale별 숫자/거리/날짜 포맷 검수

### 8.2 Prerender/SEO 책임

- 정적 생성 가능한 경로는 빌드 시 prerender 우선
- 메타데이터에 canonical/hreflang 반영
- `sitemap.xml`/`robots.txt` 운영 자동화

출시 게이트:

- locale별 canonical/alternate 링크 검증
- sitemap 제출 및 인덱싱 상태 확인
- robots에서 `/api` 크롤링 정책 확인

### 8.3 GSC(Search Console) 책임

- 속성 타입(도메인 vs URL-prefix) 전략 수립
- DNS TXT 기반 소유권 검증 운영
- 사이트맵 제출/오류 모니터링 루틴 수립

출시 게이트:

- Property Verified
- Sitemap Submitted
- 주요 랜딩 URL 인덱스 상태 확인

### 8.4 Google Ads 책임

- 정책 위반 사전 점검 (Destination/Editorial/Misrepresentation)
- 광고 랜딩 품질 점검 (HTTP 200, 모바일 동작, 콘텐츠 일치)
- 지역별 동의 정책(특히 EEA/UK) 반영 확인

출시 게이트:

- 랜딩 페이지 주요 URL의 AdsBot 접근성 확인
- Destination not working 리스크 점검
- 지역별 동의 배너/Consent mode 정책 반영

---

## 9) 멀티 에이전트 티켓 템플릿

```md
[Ticket]
- id: MAP-017
- lane: multi-agent
- owner-agent: map-agent
- goal: 모바일 전환 시 KR에서 Kakao -> Leaflet 비의도 fallback 제거
- editable-paths:
  - app/results/kakao-map.tsx
  - app/results/page.tsx
- non-goals:
  - 추천 알고리즘 변경 금지
- done-criteria:
  - 모바일/웹 전환 후 provider=Kakao 유지
  - fallback은 SDK 로드 실패 시에만 발생
- verification:
  - npx tsc --noEmit
  - npm run build
  - playwright: results_kr_provider_switch.spec.ts
- risks:
  - mobile offset 처리 중 pan/center 충돌
```

Fast lane 템플릿:

```md
[Ticket]
- id: FE-FAST-031
- lane: fast
- owner-agent: frontend-agent
- goal: 버튼 카피/간격 수정
- editable-paths:
  - app/results/page.tsx
  - app/globals.css
- done-criteria:
  - 카피 변경 + 반응형 깨짐 없음
- verification:
  - npx tsc --noEmit
  - manual: desktop/mobile screenshot 확인
```

---

## 10) 도입 로드맵

### Phase 1 (즉시)

- Fast/Standard/Multi 레인 운영 시작
- 에이전트 6개 운영: `orchestrator`, `frontend`, `design`, `backend`, `qa`, `platform`
- `global-growth-agent`는 문서/SEO/i18n 설계부터 시작
- `design-agent`는 디자인 토큰/시각 QA 기준선 수립부터 시작

### Phase 2 (2~3주)

- `map-agent`와 `global-growth-agent`를 실작업 에이전트로 분리
- CODEOWNERS + Branch protection 강화
- 글로벌 SEO/Ads 사전 점검 체크리스트 CI에 연결

### Phase 3 (안정화)

- Merge queue 도입
- 배포 전/후 헬스체크 자동화
- 국가/언어별 KPI 대시보드와 운영 룰 연결

---

## 11) 지금 바로 적용할 액션

1. `docs/todo-global-launch.md`에 `global-growth-agent`, `design-agent` 소유권 반영
2. `CODEOWNERS`에 `team-growth` 추가
3. CI에 `seo-smoke`(sitemap/robots/meta) 추가
4. 다국어 파일 구조 초안(`messages/ko.json`, `messages/en.json`) 생성
5. `docs/design-agent-playbook.md` 생성 (시각/접근성/모션/반응형 기준)

---

## 12) 외부 참고 자료

에이전트/워크플로우 설계:

1. Anthropic, *Building effective agents*  
   https://www.anthropic.com/engineering/building-effective-agents
2. OpenAI, *Agents SDK guide*  
   https://developers.openai.com/api/docs/guides/agents-sdk
3. OpenAI Agents SDK, *Handoffs*  
   https://openai.github.io/openai-agents-js/guides/handoffs/
4. LangChain LangGraph, *Workflows and agents*  
   https://docs.langchain.com/oss/javascript/langgraph/workflows-agents
5. Microsoft AutoGen, *AgentChat user guide*  
   https://microsoft.github.io/autogen/dev/user-guide/agentchat-user-guide/index.html

GitHub 운영:

6. GitHub Docs, *About protected branches*  
   https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches
7. GitHub Docs, *About code owners*  
   https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners

Next.js (i18n/prerender/metadata/sitemap):

8. Next.js, *Internationalization (App Router)*  
   https://nextjs.org/docs/app/building-your-application/routing/internationalization
9. Next.js, *generateStaticParams*  
   https://nextjs.org/docs/app/api-reference/functions/generate-static-params
10. Next.js, *generateMetadata (alternates/canonical)*  
    https://nextjs.org/docs/app/api-reference/functions/generate-metadata
11. Next.js, *sitemap.xml metadata file*  
    https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
12. Next.js, *robots.txt metadata file*  
    https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots

Google Search / Search Console:

13. Google Search Central, *Localized versions (hreflang)*  
    https://developers.google.com/search/docs/specialty/international/localized-versions
14. Google Search Central, *Managing multi-regional and multilingual sites*  
    https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites
15. Search Console Help, *Add a website property*  
    https://support.google.com/webmasters/answer/34592
16. Search Console Help, *Verify your site ownership*  
    https://support.google.com/webmasters/answer/9008080
17. Search Console Help, *Manage your sitemaps*  
    https://support.google.com/webmasters/answer/7451001

Google Ads / Consent:

18. Advertising Policies Help, *Google Ads policies*  
    https://support.google.com/adspolicy/answer/6008942
19. Advertising Policies Help, *Destination not working*  
    https://support.google.com/adspolicy/answer/16428019
20. Google Tag Platform, *Set up consent mode on websites*  
    https://developers.google.com/tag-platform/security/guides/consent


Design 품질 기준:

21. W3C, *Web Content Accessibility Guidelines (WCAG) 2.2*  
    https://www.w3.org/TR/WCAG22/
22. W3C WAI-ARIA APG, *Dialog (Modal) Pattern*  
    https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
23. W3C WAI-ARIA APG, *Slider Pattern*  
    https://www.w3.org/WAI/ARIA/apg/patterns/slider/
24. web.dev, *Responsive web design basics*  
    https://web.dev/articles/responsive-web-design-basics
25. web.dev, *INP threshold*  
    https://web.dev/inp/
26. W3C I18N, *Language tags in HTML and XML*  
    https://www.w3.org/International/questions/qa-choosing-language-tags.en.html
27. Nielsen Norman Group, *10 Usability Heuristics for User Interface Design*  
    https://www.nngroup.com/articles/ten-usability-heuristics/
