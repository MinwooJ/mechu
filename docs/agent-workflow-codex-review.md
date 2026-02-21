# agent-workflow-design.md — Codex CLI 대조 리뷰

> 작성일: 2026-02-21 (rev.3)
> 대상 문서: `docs/agent-workflow-design.md`, `docs/design-agent-playbook.md`, `docs/todo-global-launch.md`
> 비교 기준: OpenAI Codex CLI (2026-02 기준)

---

## 1. 이번 업데이트 변경 요약

| 변경 | 상세 |
|---|---|
| **신규 에이전트 `design-agent` (§3.H)** | 디자인 시스템 토큰, 접근성(WCAG 2.2 AA), 반응형/인터랙션 품질, 로컬라이제이션 레이아웃 내구성 담당 |
| **신규 플레이북** | `docs/design-agent-playbook.md` — 9개 섹션, 체크리스트 4종, 컴포넌트별 가이드 포함 |
| **승격 트리거 추가 (§4.4)** | `app/globals.css` 또는 `app/components/**` 디자인 시스템 토큰 변경 시 승격 |
| **로드맵 변경 (§10)** | Phase 1 에이전트 5→6개 (`design` 추가) |
| **즉시 액션 추가 (§11)** | #1에 `design-agent` 소유권, #5에 플레이북 생성 추가 |
| **참고 자료 추가 (§12)** | Design 품질 기준 7개 (WCAG 2.2, WAI-ARIA APG, web.dev, Nielsen) |
| **todo-global-launch.md 업데이트** | `design-agent`가 i18n/prerender/성능 항목의 공동 오너로 추가 |

---

## 2. 섹션별 대응 분석

| # | 설계 문서 섹션 | Codex 대응 방식 | 구현 난이도 |
|---|---|---|---|
| 1 | 목적 | `AGENTS.md` 서두에 프로젝트 목표로 삽입 | 즉시 |
| 2 | 도메인 분해 | `AGENTS.md`에 도메인-파일 매핑 테이블 + 서브디렉터리 `AGENTS.md` | 즉시 |
| 3 | 에이전트 토폴로지 (8개) | `config.toml`의 `[agents.*]` 섹션으로 정의 | 즉시 |
| 4 | 레인 기반 운영 | `[profiles.*]`로 모델/추론 강도 전환 + `AGENTS.md`에 승격 규칙 명시 | 중간 |
| 5 | 병렬 개발 플로우 | Codex App worktree + `codex exec` 비대화형 조합 | 중간 |
| 6 | GitHub/PR 규칙 | Codex 외부(GitHub 네이티브) | 해당 없음 |
| 7 | 품질 게이트 | `codex exec --json`으로 CI 파이프라인에 통합 | 즉시 |
| 8 | Global Growth 상세 | `AGENTS.md` 지시문 + 전용 Skill로 체크리스트 패키징 | 중간 |
| 9 | 티켓 템플릿 | `.agents/skills/create-ticket/SKILL.md`로 패키징 | 즉시 |
| 10 | 도입 로드맵 | Codex 설정 점진 배포와 정렬 가능 | — |
| 11 | 즉시 액션 | Codex 설정 파일 생성으로 대부분 흡수 | 즉시 |
| 12 | 외부 참고 자료 | `AGENTS.md` references 또는 `.agents/skills/*/references/` | 즉시 |
| — | design-agent-playbook.md | Codex Skill 또는 서브디렉터리 `AGENTS.md`로 변환 | 즉시 |

---

## 3. 기능 대조표

| 설계 문서 개념 | Codex CLI 내장 기능 | 매핑 | 비고 |
|---|---|---|---|
| **오케스트레이터 + 전문 에이전트** | `[features] multi_agent = true` + `[agents.*]` | 직접 | 실험적. config.toml에서 명시 활성화 필요 |
| **에이전트 역할 분리** (8개) | `[agents.frontend]` 등 TOML 섹션 | 직접 | `description`, `config_file`로 역할을 분리하고 상세 정책은 agent config/`AGENTS.md`로 관리 |
| **수정 권한(editable-paths)** | `sandbox_mode` + `writable_roots` | 부분 | 디렉터리 단위만 하드 제어. 파일 단위는 `AGENTS.md` 소프트 제한 |
| **금지 범위(non-goals)** | `AGENTS.md` + 에이전트 전용 문서(`.agents/agents/*/AGENT.md`) | 부분 | 하드 차단은 어려워도 운영 규칙 강제는 가능 |
| **레인(Fast/Standard/Multi)** | `[profiles.*]` | 부분 | 모델·reasoning_effort 전환 가능. 승격 로직은 미내장 |
| **승격 트리거** (§4.4, 6개) | 미내장 | 갭 | `AGENTS.md` 또는 Skill로 판단 로직 명시 필요 |
| **worktree 병렬 개발** | Codex App `~/.codex/worktrees/` | 직접 | CLI 단독 시 수동 git worktree |
| **티켓 템플릿** (§9) | Skills (`SKILL.md` + 디렉터리) | 직접 | `$create-ticket`으로 호출 |
| **산출물 제출 포맷** (§5 Step3) | 미내장 | 갭 | Skill로 출력 템플릿 유도 |
| **품질 게이트** (§7) | `codex exec` + `--json` | 직접 | CI 자동화 가능 |
| **design-agent 플레이북** | Skill 또는 `AGENTS.md` | 직접 | `.agents/skills/design-review/` 또는 서브디렉터리 AGENTS.md |
| **디자인 체크리스트** (4종) | Skill 체크리스트 | 직접 | 접근성/반응형/성능/로컬라이제이션 각각 Skill로 분리 가능 |
| **Global Growth 체크리스트** (§8) | Skill + `AGENTS.md` | 직접 | i18n/SEO/GSC/Ads 각각 Skill로 분리 가능 |
| **CODEOWNERS** | GitHub 네이티브 | 해당 없음 | Codex 범위 밖 |
| **Playwright 원칙** (§7) | `codex exec` 실행 | 직접 | trace 설정은 Playwright 측 |

---

## 4. 강점 분석

### 4.1 설계의 강점

1. **역할-파일 범위 명시** — `[agents.*]`의 `description` + `config_file` 분리와 `AGENTS.md`/`.agents/agents/*/AGENT.md` 조합으로 역할·범위를 명확하게 표현 가능.

2. **design-agent 분리가 적절** — UI 구현(frontend-agent)과 시각 품질 검수(design-agent)를 분리하여, 코드 작성과 품질 게이트를 다른 에이전트가 담당. Codex의 `sandbox_mode = "read-only"` 설정으로 design-agent를 리뷰 전용으로 운영 가능.

3. **플레이북이 Skill로 자연스럽게 변환** — `design-agent-playbook.md`의 구조(체크리스트 4종 + 컴포넌트별 가이드 + 산출물 템플릿)가 Codex Skills 포맷과 잘 맞음.

4. **승격 트리거에 디자인 토큰 변경 추가** — `globals.css`/`components/**` 변경이 승격 조건에 포함되어 시각 회귀 위험을 잡아냄.

5. **todo-global-launch.md의 소유권 연동** — design-agent가 i18n/prerender/성능 항목의 공동 오너로 명시되어 책임 추적이 가능.

6. **검증 명령 표준화** — 레인별 검증 명령이 `codex exec` 비대화형 실행과 직접 연결.

7. **로드맵의 점진성** — Phase 1(6개) → Phase 2(8개) → Phase 3(자동화)가 현실적.

### 4.2 설계의 약점/리스크

1. **frontend-agent ↔ design-agent 파일 범위 중복** — 두 에이전트 모두 `app/onboarding/**`, `app/preferences/**`, `app/results/**`, `app/globals.css`, `app/components/**`에 쓰기 권한을 가짐. 동시 수정 시 충돌 위험. Codex의 `writable_roots`로는 이 둘을 분리할 수 없음(같은 디렉터리).
   - **권장**: design-agent를 `sandbox_mode = "read-only"`로 설정하고 리뷰/검수 전용으로 운영. 실제 수정은 frontend-agent가 수행.

2. **8개 에이전트 동시 운영** — multi-agent 실험적 기능에서 8개는 부담. Phase 1에서 6개로 시작하는 것은 합리적이나, design-agent가 read-only 리뷰어라면 실질적 병렬 작업 에이전트는 5개(orchestrator 제외 시 4개)로 관리 가능.

3. **CODEOWNERS에 `@team-design` 미포함** — §6의 CODEOWNERS 예시에 design 팀이 빠져있음. `app/globals.css`, `app/components/**`에 `@team-design` 추가 필요.

4. **CLAUDE.md 미갱신** — 프로젝트 루트 `CLAUDE.md` §10 참고 문서에 `docs/agent-workflow-design.md`, `docs/design-agent-playbook.md`가 없음. 새 AI 세션이 이 문서들을 인지하지 못할 수 있음.

5. **플레이북 ↔ 설계 문서 정보 중복** — `design-agent-playbook.md`의 담당 범위/수정 권한과 `agent-workflow-design.md` §3.H의 내용이 거의 동일. 한쪽만 수정하면 불일치 발생 위험.
   - **권장**: 설계 문서에는 역할/범위 요약만 두고, 상세 체크리스트/가이드는 플레이북으로 단일 소스 유지. 설계 문서에서 플레이북을 링크.

6. **파일 단위 권한 하드 제어 불가** — Codex sandbox는 디렉터리 단위(`writable_roots`). 파일 수준 제한은 `AGENTS.md` 소프트 제한으로만 구현.

7. **레인 승격 자동화 부재** — 6개 승격 조건을 Codex가 자동 판단하지 않음. orchestrator `AGENTS.md`에 명시하되, `git diff --name-only`로 변경 파일 확인 후 판단 유도.

8. **서브 에이전트 비대화형 승인** — 서브 에이전트는 사용자 승인이 필요한 액션 시 실패 반환. orchestrator의 "머지 승인" 흐름과 다를 수 있음.

9. **Global Growth 외부 의존성** — GSC(Property Verified), Ads(AdsBot 접근성) 등은 외부 서비스 상태에 의존. 자동 검증하려면 MCP 서버 연동 필요.

---

## 5. 문서 간 일관성 점검

| 점검 항목 | 상태 | 조치 필요 |
|---|---|---|
| agent-workflow-design.md §3.H ↔ design-agent-playbook.md §2 담당 범위 | 일치 | — |
| agent-workflow-design.md §3.H 수정 권한 ↔ playbook §2 수정 권한 | 일치 | — |
| agent-workflow-design.md §10 Phase 1 에이전트 수 (6개) ↔ §3 토폴로지 (8개) | 일관 | Phase 1에서 6개, Phase 2에서 8개로 정렬됨 |
| agent-workflow-design.md §11 즉시 액션 #5 ↔ playbook 실제 존재 | 일치 | playbook 이미 생성됨 |
| todo-global-launch.md 오너 ↔ design-agent 역할 | 일치 | i18n/prerender/성능에 공동 오너로 반영됨 |
| **CLAUDE.md §10 참고 문서** | **누락** | `agent-workflow-design.md`, `design-agent-playbook.md` 추가 필요 |
| **CODEOWNERS 예시** | **누락** | `@team-design` 추가 필요 |
| frontend-agent 수정 권한 ↔ design-agent 수정 권한 | **중복** | design-agent를 read-only 운영 권장 |
| playbook §6 협업 규칙 ↔ workflow 에이전트 목록 | 일치 | frontend/map/qa/growth 4개 에이전트 언급 |
| playbook §8 검증 명령 ↔ workflow §7 품질 게이트 | 일치 | tsc/build/playwright 동일 |

---

## 6. Codex 설정 파일 변환 가이드

### 6.1 AGENTS.md (프로젝트 루트)

```markdown
# AGENTS.md

## 프로젝트 개요
MECHU: 위치 기반 점메추/저메추 Top3 추천 서비스.
로그인 없이 즉시 사용, 한국(KR) 사용성 최적화(Kakao 우선).

## 도메인-파일 매핑

| 도메인 | 주요 파일 |
|---|---|
| 프론트/UI | `app/onboarding/*`, `app/preferences/*`, `app/results/page.tsx`, `app/status/page.tsx`, `app/components/*`, `app/globals.css` |
| 지도 | `app/results/interactive-map.tsx`, `app/results/kakao-map.tsx`, `app/onboarding/location-picker.tsx` |
| API/추천 | `app/api/*/route.ts`, `lib/reco/service.ts` |
| 운영/배포 | `wrangler.jsonc`, `open-next.config.ts`, `migrations/*` |
| 디자인 시스템 | `app/globals.css`, `app/components/**`, `public/brand/**` |

## 에이전트 역할 및 수정 범위

### orchestrator
- 요구사항 분해, 레인(Fast/Standard/Multi) 선택, 통합 검증
- 직접 코드 수정 금지 — 지시·검증·통합만 수행
- 승격 트리거 판단: 아래 조건 중 하나라도 해당하면 상위 레인 적용
  - `countryCode` 기반 분기 수정
  - `kakao-map.tsx` 또는 `interactive-map.tsx` 수정
  - `wrangler.jsonc` 또는 env/secret 정책 수정
  - `/api/recommendations` 응답 계약 수정
  - Ads/SEO 노출에 영향 있는 URL/메타 변경
  - `app/globals.css` 또는 `app/components/**`의 디자인 시스템 토큰 변경

### frontend-agent
- UI/UX 구현, 반응형, 접근성 코드 작성
- 수정 허용: `app/**` (단, `app/api/**` 제외), `public/**`, `app/globals.css`
- 수정 금지: API 라우트, 추천 로직, 지도 컴포넌트

### design-agent
- 디자인 시스템 토큰/접근성/반응형/로컬라이제이션 레이아웃 품질 검수
- 기본 운영: 리뷰 전용(read-only). 토큰/스타일 수정이 필요하면 frontend-agent에 지시
- 상세: `docs/design-agent-playbook.md` 참조
- 협업: frontend-agent(UI 구현), map-agent(제스처 충돌), qa-agent(시각 회귀), growth-agent(다국어 카피)

### map-agent
- Kakao/Leaflet 분기 안정성, 모바일 터치/팬/줌/포커싱
- 수정 허용: `app/results/interactive-map.tsx`, `app/results/kakao-map.tsx`, `app/onboarding/location-picker.tsx`
- 수정 금지: API 라우트, 추천 알고리즘

### backend-agent
- 국가 분기(KR/Non-KR), 공급자 폴백, API 안정성, 추천 로직
- 수정 허용: `app/api/**`, `lib/reco/**`, `migrations/**`
- 수정 금지: 프론트엔드 컴포넌트, 지도 컴포넌트

### qa-agent
- Playwright 회귀 테스트, trace 기반 실패 분석
- 수정 허용: `tests/**`, `playwright.config.*`
- 읽기 전용: 나머지 전체
- 원칙: locator 중심, 사용자 관점 assertion, 실패 시 trace 유지

### platform-agent
- Cloudflare Workers 배포, Wrangler 설정(`keep_vars`), CI/CD
- 수정 허용: `wrangler.jsonc`, `.github/workflows/**`
- 수정 금지: 앱 코드

### global-growth-agent
- i18n/SEO/GSC/Google Ads 정책
- 수정 허용: `app/layout.tsx`, `app/**/page.tsx`(메타/국제화), `app/sitemap.ts`, `app/robots.ts`, `messages/**`, `docs/todo-global-launch.md`
- 상세: `docs/agent-workflow-design.md` §8 참조

## 레인 선택 규칙
- **Fast**: 파일 1~3개, API·DB·배포·지도 분기·디자인 토큰 변경 없음
- **Standard**: 프론트+맵 또는 프론트+API 경계, 파일 4~10개
- **Multi-agent**: 지도 공급자/국가 분기/추천 알고리즘/배포 변수/디자인 시스템 토큰 변경

## 검증 게이트
- 모든 변경: `npx tsc --noEmit`
- Standard 이상: `npm run build`
- Multi-agent: `npm run cf:build` + Playwright 스모크

## 산출물 제출 포맷
모든 에이전트는 작업 완료 시 다음을 보고:
1. 변경 파일 목록
2. 설계 의도/트레이드오프
3. 실행한 검증 명령과 결과
4. 남은 리스크

design-agent는 추가로:
5. Before/After 스크린샷 (desktop/mobile)
6. 접근성 체크 결과
7. 반응형 체크 결과
```

### 6.2 config.toml (`.codex/config.toml`)

```toml
#:schema https://developers.openai.com/codex/config-schema.json

model = "gpt-5-codex"
approval_policy = "on-request"
sandbox_mode = "workspace-write"

[features]
multi_agent = true
shell_tool = true

# --- 에이전트 역할 정의 ---

[agents.orchestrator]
description = "Task decomposition, lane selection, integration and final validation"
config_file = ".codex/agents/orchestrator.toml"

[agents.frontend]
description = "UI/UX and responsive implementation"
config_file = ".codex/agents/frontend.toml"

[agents.design]
description = "Design system, visual quality, accessibility-first UI review"
config_file = ".codex/agents/design.toml"

[agents.map]
description = "Map provider branching and touch/map interaction quality"
config_file = ".codex/agents/map.toml"

[agents.backend]
description = "API contracts, recommendation engine, provider fallback logic"
config_file = ".codex/agents/backend.toml"

[agents.qa]
description = "Playwright regression and release safety checks"
config_file = ".codex/agents/qa.toml"

[agents.platform]
description = "Cloudflare deployment and runtime/build environment policy"
config_file = ".codex/agents/platform.toml"

[agents.global_growth]
description = "i18n, SEO/GSC, prerender strategy, Google Ads policy readiness"
config_file = ".codex/agents/global-growth.toml"
```

### 6.3 Skills (`.agents/skills/`)

#### 6.3.1 티켓 생성

**`.agents/skills/create-ticket/SKILL.md`:**

```markdown
---
name: create-ticket
description: MECHU 멀티 에이전트 작업 티켓을 생성합니다.
---

# 티켓 생성

## 절차
1. 요구사항 분석 → 레인(fast/standard/multi-agent) 결정
2. 승격 트리거 확인 (countryCode 분기, 지도 컴포넌트, wrangler, API 계약, SEO/메타, 디자인 토큰)
3. 담당 에이전트 배정 + 수정 가능/금지 파일 범위 명시
4. 검증 명령어 포함

## 템플릿

[Ticket]
- id: {DOMAIN}-{NUMBER}
- lane: {fast|standard|multi-agent}
- owner-agent: {agent-name}
- goal: {목표 설명}
- editable-paths:
  - {파일 경로}
- non-goals:
  - {금지 사항}
- done-criteria:
  - {완료 기준}
- verification:
  - npx tsc --noEmit
  - {추가 검증}
- design-review: {yes|no}
- risks:
  - {리스크 목록}
```

#### 6.3.2 품질 게이트

**`.agents/skills/quality-gate/SKILL.md`:**

```markdown
---
name: quality-gate
description: MECHU 품질 게이트를 레인에 맞게 실행합니다.
---

# 품질 게이트

## 레인별 실행 명령

### Fast
- `npx tsc --noEmit`

### Standard
- `npx tsc --noEmit`
- `npm run build`
- 핵심 E2E 1~2개

### Multi-agent
- `npx tsc --noEmit`
- `npm run build`
- `npm run cf:build`
- Playwright 스모크 + 회귀 세트 (Web + Mobile, KR/Non-KR)
```

#### 6.3.3 디자인 리뷰 (신규)

**`.agents/skills/design-review/SKILL.md`:**

```markdown
---
name: design-review
description: design-agent의 시각/접근성/반응형 리뷰를 실행합니다.
---

# 디자인 리뷰

상세 기준: `docs/design-agent-playbook.md` 참조

## 체크리스트

### 접근성 (필수)
- [ ] 텍스트 대비 WCAG 2.2 AA 만족
- [ ] 키보드 포커스 항상 가시
- [ ] 인터랙티브 요소 충분한 터치/클릭 타겟
- [ ] 모달/시트/오버레이 포커스 이동 및 닫기 명확

### 반응형/인터랙션 (필수)
- [ ] 모바일/태블릿/데스크톱 핵심 UI 겹침 없음
- [ ] 바텀시트 스냅(접힘/중간/확장) 일관 동작
- [ ] 지도 조작과 바텀시트 스와이프 비간섭
- [ ] 오버레이 버튼 지도 위 가시성 유지

### 성능 체감 (권장)
- [ ] 클릭/드래그 반응 지연 체감 낮음
- [ ] 애니메이션 의미 있고 과도하지 않음
- [ ] 로딩 상태 진행 중 명확 전달

### 로컬라이제이션 내구성 (필수)
- [ ] ko/en/ja 버튼 텍스트 잘림 없음
- [ ] 숫자/거리 포맷 로케일별 자연스러움
- [ ] 카피 톤 현지화(번역체 아님)

## 산출물
1. Before/After 스크린샷 (desktop/mobile)
2. 체크리스트 결과
3. 수정 제안 (frontend-agent에 전달)
```

#### 6.3.4 Global Growth 체크리스트

**`.agents/skills/growth-checklist/SKILL.md`:**

```markdown
---
name: growth-checklist
description: Global Growth Agent의 출시 게이트 체크리스트를 실행합니다.
---

# Global Growth 출시 게이트

## i18n 게이트 [공동: design-agent]
- [ ] 핵심 플로우 100% 번역
- [ ] 버튼/에러/상태 문구 로케일 검수
- [ ] locale별 숫자/거리/날짜 포맷 검수

## SEO/Prerender 게이트 [공동: frontend-agent, design-agent]
- [ ] locale별 canonical/alternate 링크 검증
- [ ] sitemap 제출 및 인덱싱 상태 확인
- [ ] robots에서 /api 크롤링 정책 확인

## GSC 게이트
- [ ] Property Verified
- [ ] Sitemap Submitted
- [ ] 주요 랜딩 URL 인덱스 상태 확인

## Google Ads 게이트
- [ ] 랜딩 페이지 AdsBot 접근성 확인
- [ ] Destination not working 리스크 점검
- [ ] 지역별 동의 배너/Consent mode 반영
```

---

## 7. 권장 액션 아이템

### 즉시

| # | 액션 | 상세 |
|---|---|---|
| 1 | **AGENTS.md 생성** | §6.1 기반. 기존 `CLAUDE.md`와 병행 |
| 2 | **config.toml 생성** | `.codex/config.toml`에 §6.2 배치 |
| 3 | **CLAUDE.md §10에 문서 추가** | `docs/agent-workflow-design.md`, `docs/design-agent-playbook.md` 참조 추가 |
| 4 | **design-agent를 read-only로 운영** | frontend-agent와 파일 범위 중복 해결. 리뷰/검수 전용 |
| 5 | **CODEOWNERS에 `@team-design` 추가** | `app/globals.css`, `app/components/**` 경로 |

### 단기 (2~3주)

| # | 액션 | 상세 |
|---|---|---|
| 6 | **Skills 4개 생성** | `create-ticket`, `quality-gate`, `design-review`, `growth-checklist` |
| 7 | **map-agent 분리** | `[agents.map]` 활성화 + `app/results/AGENTS.md` 추가 |
| 8 | **`codex exec` CI 통합** | GitHub Actions에서 품질 게이트 자동화 |
| 9 | **프로필 활용** | `codex --profile fast`/`multi`로 레인 전환 |

### 안정화

| # | 액션 | 상세 |
|---|---|---|
| 10 | **growth-agent 분리** | i18n/SEO 본격화 시 활성화 |
| 11 | **sandbox 세분화** | design/qa `read-only`, platform `writable_roots = ["wrangler.jsonc", ".github/"]` |
| 12 | **서브디렉터리 AGENTS.md** | `app/results/`, `app/api/` 도메인 특화 |
| 13 | **MCP 서버 연동** | SEO/Ads 외부 검증용 |

---

## 8. 핵심 결론

설계 문서의 8개 에이전트 구조는 Codex CLI와 **높은 호환성**을 보인다.

**직접 매핑 (6개):**
- 에이전트 역할 → `[agents.*]`
- 레인 → `[profiles.*]`
- 티켓 템플릿 → Skills
- worktree → Codex 네이티브
- 품질 게이트 → `codex exec --json`
- 디자인 플레이북 → Skill (`$design-review`)

**소프트 보완 (3개):**
- 파일 단위 수정 권한 → `AGENTS.md` 지시문
- 레인 승격 자동화 → orchestrator 지시문
- 산출물 제출 포맷 → Skill 출력 템플릿

**주요 조치 필요 (3개):**
1. **frontend ↔ design 파일 범위 중복** → design-agent `read-only` 운영으로 해결
2. **CLAUDE.md / CODEOWNERS 미갱신** → 즉시 업데이트
3. **플레이북 ↔ 설계 문서 정보 중복** → 설계 문서에 요약만 두고 플레이북을 단일 소스로 유지
