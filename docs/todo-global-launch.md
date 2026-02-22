# MECHU Global Launch TODO

글로벌 서비스 전환 시 놓치지 않기 위한 체크리스트입니다.

마지막 업데이트: 2026-02-22 (KST)

운영 원칙:

- P0/P1 항목은 `global-growth-agent`가 오너, `design-agent`/`platform-agent`/`frontend-agent`가 공동 수행
- 정책/검증 실패 항목은 Fast lane이 아닌 Standard 이상 레인으로 승격

---

## P0 (출시 전 필수)

### 1) 다국어(i18n) [Owner: global-growth-agent + design-agent]

- [x] 지원 언어 1차 범위 확정 (`ko`, `en` 최소)
- [x] URL 전략 확정 (`/ko`, `/en` 경로 기반)
- [x] 기본 언어/국가 결정 로직 정의 (브라우저 언어 + 사용자 선택 우선)
- [x] 언어 전환 UI(헤더/설정) 추가
- [x] UI 문자열 분리 (`messages/ko.json`, `messages/en.json`)
- [x] 번역 키 체계 정리 (서버/클라이언트 공통)
- [x] 상태/에러/버튼 문구 번역 완료
- [x] 거리/숫자/날짜 로케일 포맷 적용 (`Intl`)
- [x] `hreflang` + `canonical` 메타 적용

현재 구현 상태 메모:
- 실제 지원 언어: `ko`, `en`, `ja`, `zh-Hant`
- locale prefix 라우팅 + 언어 스위처 + 쿠키/Accept-Language/IP fallback 동작 중
- 관련 가이드: `docs/i18n-guide.md`

### 2) SEO + Search Console [Owner: global-growth-agent]

- [ ] 프로덕션 도메인 확정 + HTTPS 강제
- [x] `sitemap.xml` 생성 (언어별 URL 포함)
- [x] `robots.txt` 점검 (`/api` 비노출, 주요 페이지 허용)
- [ ] `sitemap.xml` 배포 확인 + 제출
- [ ] Search Console 속성 등록 (Domain property 우선 검토)
- [ ] DNS TXT 소유권 인증
- [ ] 사이트맵 제출
- [ ] 핵심 URL 인덱싱 점검 (onboarding/preferences/results, status는 noindex 정책)
- [ ] 크롤링 오류/모바일 사용성/핵심 성능 지표 모니터링 루틴 수립

현재 구현 상태 메모:
- canonical/hreflang/OG/Twitter 메타: locale 페이지 기준 적용 완료
- `status` 페이지: `noindex, nofollow` 적용
- `sitemap.xml`: indexable 섹션(`onboarding/preferences/results`)만 포함 (4 locale x 3 = 12 URL)
- `robots.txt`: `Disallow: /api` + sitemap 경로 노출
- 관련 가이드: `docs/seo-search-console-guide.md`

### 3) Prerender/렌더링 전략 [Owner: global-growth-agent + frontend-agent + design-agent]

- [ ] 정적 생성 가능한 경로 목록 정의
- [ ] locale 경로별 prerender 전략 수립
- [x] 메타데이터(og/canonical/alternates) 자동 생성 구조 점검
- [ ] 페이지별 로딩/오류 상태가 인덱싱 품질을 해치지 않는지 점검

### 4) Google Ads 도입 준비 [Owner: global-growth-agent]

- [ ] Google Ads 계정/결제 설정
- [ ] 전환 목표 정의 (예: 추천 조회 완료, 지도 보기 클릭)
- [ ] GA4와 Ads 연동
- [ ] UTM 규칙 문서화 (`utm_source`, `utm_medium`, `utm_campaign`)
- [ ] 언어별 랜딩 페이지 준비
- [ ] 정책 점검 (Destination/Editorial/Misrepresentation)
- [ ] 국가별 동의 정책(EEA/UK 포함) 반영 계획 확정
- [ ] 초기 예산/입찰 전략 수립

### 5) 개인정보/동의 [Owner: platform-agent + global-growth-agent]

- [ ] 개인정보처리방침에 수집 항목 반영 (`session_id`, `ip_country`, `search_country`, `mode`)
- [ ] 쿠키/추적 동의 배너 범위 확정
- [ ] 동의 전 비필수 추적 차단 로직 점검
- [ ] 로그 보관 기간/삭제 정책 명시

---

## P1 (출시 직후 1~2주)

### 6) 성능/품질 [Owner: qa-agent + global-growth-agent + design-agent]

- [ ] 언어별 Lighthouse 점검
- [ ] 모바일 레이아웃 언어별 오버플로우 테스트
- [ ] 지도 스크립트 실패 시 대체 문구 번역 점검

### 7) 지표 대시보드 [Owner: backend-agent + global-growth-agent]

- [ ] 국가별 유입/전환 대시보드 구성
- [ ] 검색 국가 vs IP 국가 분포 모니터링
- [ ] 지도 보기 버튼 CTR 모니터링
- [ ] 빈 결과율/오류율 알림 임계치 설정

### 8) 광고 최적화 [Owner: global-growth-agent]

- [ ] 캠페인별 CPA/CTR 주간 리뷰
- [ ] 검색어 리포트 기반 제외 키워드 업데이트
- [ ] 국가/언어별 카피 A/B 테스트

---

## 구현 메모

- 배포: Cloudflare Edge (Next.js + OpenNext)
- 데이터 분기:
  - 한국 검색: Kakao 우선, 실패 시 Google 폴백
  - 해외 검색: Google 우선
- 이벤트 최소 필드:
  - `session_id`
  - `ip_country`
  - `search_country`
  - `mode`

---

## 완료 기준 (Definition of Done)

- [x] 다국어 최소 2개 언어로 핵심 플로우 100% 동작
- [ ] Search Console 속성 검증 및 사이트맵 제출 완료
- [ ] Ads 랜딩 품질 점검 통과 + 전환 수집 확인
- [ ] 동의/개인정보 문서 및 UI 반영 완료

---

## 최근 검증 로그 (요약)

- [x] `npx tsc --noEmit`
- [x] `npm run build`
- [x] `npm run cf:build`
- [x] `npx playwright test tests/e2e/seo.spec.ts`

---

## 운영 참고 링크

- Google Search Central: Localized versions (hreflang)  
  https://developers.google.com/search/docs/specialty/international/localized-versions
- Google Search Central: Multi-regional/multilingual  
  https://developers.google.com/search/docs/advanced/crawling/managing-multi-regional-sites
- Search Console Help: Add property  
  https://support.google.com/webmasters/answer/34592
- Search Console Help: Verify ownership  
  https://support.google.com/webmasters/answer/9008080
- Search Console Help: Manage sitemaps  
  https://support.google.com/webmasters/answer/7451001
- Next.js: Internationalization  
  https://nextjs.org/docs/app/building-your-application/routing/internationalization
- Next.js: generateStaticParams  
  https://nextjs.org/docs/app/api-reference/functions/generate-static-params
- Next.js: sitemap/robots metadata
  https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
  https://nextjs.org/docs/app/api-reference/file-conventions/metadata/robots
- Google Ads policies
  https://support.google.com/adspolicy/answer/6008942
  https://support.google.com/adspolicy/answer/16428019
- Consent mode on websites
  https://developers.google.com/tag-platform/security/guides/consent
