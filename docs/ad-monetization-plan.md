# 광고 수익화 계획 — Google Ad Manager Rewarded

> 최종 수정: 2026-02-22

## 1. 개요

mechu 웹앱에 **Google Ad Manager(GAM) Rewarded 광고**를 도입하여 수익화한다.
"다시뽑기" 버튼에 리워드 광고를 연동하여, 사용자가 광고를 시청한 뒤 새 추천을 받는 구조.

### 왜 GAM Rewarded인가?

| 비교 항목 | AdSense 디스플레이 (커스텀 오버레이) | GAM Rewarded |
|-----------|--------------------------------------|--------------|
| 전체화면 광고 | 직접 구현 필요 | 네이티브 지원 (GPT 제공) |
| 카운트다운 타이머 | 직접 구현 | 자동 내장 |
| 리워드 이벤트 | 없음 | `rewardedSlotGranted` 이벤트 |
| 광고 로드 감지 | 불안정 | `rewardedSlotReady` 이벤트 |
| CPM | $1–$5 | **$10–$50** |
| 정책 리스크 | 높음 (비공식 패턴) | 없음 (공식 포맷) |

---

## 2. 전제 조건 (수동 작업)

아래 순서대로 진행해야 한다. 각 단계는 이전 단계의 승인/완료가 필요하다.

### Step 1: AdSense 계정 승인

GAM 가입의 필수 선행 조건. AdSense 승인을 위해 아래가 필요:

- 개인정보처리방침, 이용약관, 소개, 연락처 페이지 (4개 언어)
- `ads.txt` 파일 (`https://mechu.ggrank.xyz/ads.txt`)
- AdSense 인증 스크립트/메타태그
- Google Search Console 인덱싱
- Cloudflare에서 Google 크롤러 미차단 확인

### Step 2: GAM 무료 계정 가입

- https://admanager.google.com 에서 AdSense 계정으로 가입
- 무료 티어 — 트래픽 최소 요건 없음
- 월 180M 노출 상한 (대부분 지역)

### Step 3: GAM에서 Rewarded 광고 단위 생성

- 네트워크 ID 확인 (예: `12345678`)
- Rewarded 광고 단위 생성 → 광고 단위 경로 획득 (예: `/12345678/mechu-reroll`)
- "Block non-instream video ads" 설정 비활성화 필수

---

## 3. AdSense 승인 요건 상세

### 3.1 필수 페이지

| 페이지 | 경로 | 필수 내용 |
|--------|------|-----------|
| 개인정보처리방침 | `/[locale]/legal/privacy` | Google 광고 쿠키 사용 고지, 위치 데이터 활용 방침, 제3자 광고 타겟팅, [Google 광고 설정](https://adssettings.google.com/) 링크 |
| 이용약관 | `/[locale]/legal/terms` | 추천 서비스 면책, 서비스 이용 조건 |
| 소개 | `/[locale]/legal/about` | mechu 서비스 설명, 개발 목적 |
| 연락처 | `/[locale]/legal/contact` | 이메일 주소 제공 |

4개 페이지 x 4개 언어 (ko, en, ja, zh-Hant) = 16개 페이지

### 3.2 기술 요건

- **ads.txt**: `public/ads.txt`에 `google.com, pub-XXXXXXXX, DIRECT, f08c47fec0942fa0`
- **인증 스크립트**: root layout `<head>`에 AdSense 스크립트 또는 메타태그
- **HTTPS**: 이미 적용됨
- **모바일 최적화**: 이미 적용됨
- **robots.txt**: `/api`만 차단, 나머지 허용 (이미 적용됨)
- **sitemap.xml**: 법적 페이지 포함 필요

### 3.3 주요 거절 사유와 대비

| 거절 사유 | 현재 상태 | 대비 방안 |
|-----------|-----------|-----------|
| 정책 페이지 없음 | 미존재 | 4개 페이지 생성 |
| 콘텐츠 부족 | 도구형 앱 (텍스트 적음) | 법적 페이지 추가로 보완 |
| 네비게이션 부족 | Footer 없음 | Footer 컴포넌트 추가 |
| 깨진 링크 | 없음 | 배포 전 전수 확인 |
| 트래픽 부족 | 신규 사이트 | SEO 최적화 (이미 진행 중) |

### 3.4 승인 소요 시간

| 시나리오 | 예상 기간 |
|----------|-----------|
| 최선 (양질 콘텐츠, 기존 트래픽) | 24–48시간 |
| 일반 (신규 사이트, 양호한 콘텐츠) | 1–2주 |
| 지연 | 2–4주 |
| 거절 후 재신청 | 추가 2–4주 |

---

## 4. GAM Rewarded 기술 구현

### 4.1 아키텍처

```
app/layout.tsx
├── AdSense 인증 스크립트 (조건부: NEXT_PUBLIC_ADSENSE_CLIENT_ID)
└── GPT 스크립트 (조건부: NEXT_PUBLIC_GAM_NETWORK_ID)

app/results/results-client.tsx
├── useRewardedAd(adUnitPath) 훅
├── reroll() → 첫 회 무료 / 이후 옵트인 모달
└── <RewardedAdPrompt /> 옵트인 모달 컴포넌트

lib/hooks/use-rewarded-ad.ts
└── GPT Rewarded 슬롯 관리 + 이벤트 핸들링
```

### 4.2 GPT 스크립트 로드

`app/layout.tsx`에 추가:

```tsx
import Script from "next/script";

// AdSense 인증용 (승인 심사 시 필요)
{process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID && (
  <Script
    async
    src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID}`}
    crossOrigin="anonymous"
    strategy="afterInteractive"
  />
)}

// GAM Rewarded용 (실제 광고 표시)
{process.env.NEXT_PUBLIC_GAM_NETWORK_ID && (
  <Script
    async
    src="https://securepubads.g.doubleclick.net/tag/js/gpt.js"
    strategy="afterInteractive"
  />
)}
```

### 4.3 `useRewardedAd` 훅

```typescript
// lib/hooks/use-rewarded-ad.ts
"use client";

// Props: adUnitPath (예: "/12345678/mechu-reroll")
// 반환: { isReady, isGranted, showAd, requestAd }

// GPT 이벤트 흐름:
// 1. googletag.defineOutOfPageSlot(adUnitPath, googletag.enums.OutOfPageFormat.REWARDED)
// 2. rewardedSlotReady → isReady = true, makeRewardedVisible() 저장
// 3. rewardedSlotGranted → isGranted = true (리워드 수여 확인)
// 4. rewardedSlotClosed → 슬롯 정리 (destroySlots), 다음 광고 준비
// 5. slotRenderEnded + isEmpty → 광고 인벤토리 없음 (무료 허용)
```

### 4.4 사용자 플로우

```
[Results 페이지 진입]
    │
    ▼
GPT Rewarded 슬롯 사전 로드
    │
    ▼
[다시뽑기 클릭]
    │
    ├── 첫 번째 → 광고 없이 바로 re-roll (UX 개선)
    │
    └── 두 번째부터 → 옵트인 모달 표시
                       │
                       ├── "광고 보기" 클릭
                       │   └── makeRewardedVisible()
                       │       └── GAM 전체화면 광고 자동 표시
                       │           │
                       │           ├── rewardedSlotGranted → re-roll 실행
                       │           └── rewardedSlotClosed → 슬롯 정리
                       │
                       └── "취소" → re-roll 안 함

[광고 없을 때 (isEmpty)] → 무료로 re-roll 허용
```

핵심 원칙: **광고 실패가 사용자 플로우를 막지 않는다** (CLAUDE.md 정책과 일치)

### 4.5 GPT 이벤트 레퍼런스

| 이벤트 | 설명 | 사용 |
|--------|------|------|
| `rewardedSlotReady` | 광고 로드 완료, `makeRewardedVisible()` 제공 | 옵트인 모달 활성화 |
| `rewardedSlotGranted` | 리워드 수여 (payload: type, amount) | re-roll 실행 트리거 |
| `rewardedSlotVideoCompleted` | 비디오 재생 완료 | 로깅용 |
| `rewardedSlotClosed` | 사용자가 닫기 클릭 (리워드 여부 무관) | 슬롯 정리 |
| `slotRenderEnded` | 슬롯 렌더링 완료, `isEmpty`로 no-fill 감지 | 무료 re-roll 폴백 |

### 4.6 환경 변수

| 변수 | 설명 | 필요 시점 |
|------|------|-----------|
| `NEXT_PUBLIC_ADSENSE_CLIENT_ID` | AdSense 퍼블리셔 ID (예: `ca-pub-XXX`) | AdSense 승인 심사 |
| `NEXT_PUBLIC_GAM_NETWORK_ID` | GAM 네트워크 ID | GAM 가입 후 |
| `NEXT_PUBLIC_GAM_AD_UNIT_PATH` | Rewarded 광고 단위 경로 | GAM 광고 단위 생성 후 |

env 변수가 없으면 광고 시스템 전체가 비활성화된다. 개발 환경에서는 설정하지 않으면 된다.

---

## 5. 구현 파일 목록

### 새로 생성하는 파일

| 파일 | 설명 |
|------|------|
| `app/[locale]/legal/layout.tsx` | 법적 페이지 공통 레이아웃 |
| `app/[locale]/legal/privacy/page.tsx` | 개인정보처리방침 |
| `app/[locale]/legal/terms/page.tsx` | 이용약관 |
| `app/[locale]/legal/about/page.tsx` | 서비스 소개 |
| `app/[locale]/legal/contact/page.tsx` | 연락처 |
| `app/legal/privacy/page.tsx` | 레거시 리다이렉트 |
| `app/legal/terms/page.tsx` | 레거시 리다이렉트 |
| `app/legal/about/page.tsx` | 레거시 리다이렉트 |
| `app/legal/contact/page.tsx` | 레거시 리다이렉트 |
| `app/components/site-footer.tsx` | 사이트 Footer |
| `app/components/rewarded-ad-prompt.tsx` | 리워드 광고 옵트인 모달 |
| `lib/hooks/use-rewarded-ad.ts` | GPT Rewarded 커스텀 훅 |
| `public/ads.txt` | AdSense ads.txt |

### 수정하는 파일

| 파일 | 변경 내용 |
|------|-----------|
| `app/layout.tsx` | AdSense + GPT 스크립트 조건부 로드 |
| `app/results/results-client.tsx` | `useRewardedAd` 훅 연동, reroll 분리, 옵트인 모달 |
| `app/globals.css` | footer, legal page, 옵트인 모달 스타일 |
| `app/onboarding/onboarding-client.tsx` | Footer 추가 |
| `app/preferences/preferences-client.tsx` | Footer 추가 |
| `app/status/status-client.tsx` | Footer 추가 |
| `lib/seo/metadata.ts` | 법적 페이지 SEO 메타데이터 |
| `app/sitemap.ts` | 법적 페이지 sitemap 추가 |
| `lib/i18n/messages/ko.json` | legal, footer, ad 네임스페이스 |
| `lib/i18n/messages/en.json` | legal, footer, ad 네임스페이스 |
| `lib/i18n/messages/ja.json` | legal, footer, ad 네임스페이스 |
| `lib/i18n/messages/zh-Hant.json` | legal, footer, ad 네임스페이스 |

---

## 6. 구현 순서

| # | 작업 | 의존성 |
|---|------|--------|
| 1 | i18n 메시지 추가 (legal, footer, ad) | 없음 |
| 2 | 법적 페이지 라우트 + 컴포넌트 | #1 |
| 3 | SEO 메타데이터 + sitemap 업데이트 | #2 |
| 4 | Footer 컴포넌트 + 기존 페이지에 추가 | #1 |
| 5 | CSS 추가 (footer, legal, 옵트인 모달) | #4 |
| 6 | ads.txt + AdSense 인증 스크립트 | 없음 |
| 7 | GPT 스크립트 + `useRewardedAd` 훅 | 없음 |
| 8 | 옵트인 모달 컴포넌트 | #7 |
| 9 | Results 페이지에 Rewarded 연동 | #7, #8 |
| 10 | 전체 테스트 | 전체 |

---

## 7. 체크리스트

### AdSense 승인용

- [ ] 개인정보처리방침 페이지 (4개 언어)
- [ ] 이용약관 페이지 (4개 언어)
- [ ] 소개 페이지 (4개 언어)
- [ ] 연락처 페이지 (4개 언어)
- [ ] Footer에서 모든 법적 페이지 링크 접근 가능
- [ ] `ads.txt` 접근 확인 (`https://mechu.ggrank.xyz/ads.txt`)
- [ ] AdSense 인증 스크립트 `<head>` 존재
- [ ] Google Search Console 인덱싱 확인
- [ ] Cloudflare가 Google 크롤러 차단하지 않음
- [ ] 404 / 깨진 링크 없음

### GAM Rewarded 셋업용 (AdSense 승인 후)

- [ ] GAM 계정 가입
- [ ] Rewarded 광고 단위 생성
- [ ] `NEXT_PUBLIC_GAM_*` 환경 변수 설정
- [ ] Rewarded 플로우 E2E 테스트

---

## 8. 검증 방법

1. `npx tsc --noEmit` 통과
2. `npm run cf:build` 통과
3. 법적 페이지 4개 x 4개 언어 정상 렌더링
4. sitemap.xml에 법적 페이지 포함
5. `curl https://mechu.ggrank.xyz/ads.txt` 정상 응답
6. GAM GPT 스크립트 조건부 로드 (DevTools Network)
7. 다시뽑기 → 옵트인 모달 → "광고 보기" → GAM 전체화면 광고 → re-roll 실행
8. 광고 없을 시 무료 re-roll
9. 첫 번째 다시뽑기는 광고 없이 즉시 실행
10. 모바일 지도 터치/줌 + 바텀시트 스냅 정상

---

## 9. 참고 자료

- [GAM Rewarded Ads for Web — Google 공식](https://support.google.com/admanager/answer/9116812?hl=en)
- [GPT Rewarded Ad 샘플 코드](https://developers.google.com/publisher-tag/samples/display-rewarded-ad)
- [GPT API 레퍼런스](https://developers.google.com/publisher-tag/reference)
- [GPT + React/SPA 통합 가이드](https://developers.google.com/publisher-tag/samples/integrations/react)
- [GAM 가입 방법](https://support.google.com/admanager/answer/7084151?hl=en)
- [리워드 광고 단위 정책](https://support.google.com/adsense/answer/9121589)
- [AdSense 프로그램 정책](https://support.google.com/adsense/answer/48182?hl=en)
- [ads.txt 가이드](https://support.google.com/adsense/answer/12171612?hl=en)
