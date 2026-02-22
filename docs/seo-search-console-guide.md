# SEO + Search Console Guide (MECHU)

이 문서는 `docs/todo-global-launch.md`의 SEO + Search Console P0를 실제 운영 가능한 절차로 정리한 가이드입니다.

## 1) 공식 문서 기반 핵심 원칙

1. 소유권 인증은 DNS TXT(도메인 속성)가 기본
- Domain property는 하위 도메인/프로토콜을 포괄할 수 있어 글로벌 운영에 유리합니다.
- DNS에 TXT 레코드를 추가해 인증하며, DNS 반영 지연이 있을 수 있습니다.

2. 사이트맵은 정규 URL만 제출
- 사이트맵 파일 자체는 UTF-8, 절대 URL 사용을 권장합니다.
- 매우 큰 사이트맵은 분할(최대 URL 수/파일 크기 제한) 전략이 필요합니다.

3. 다국어 페이지는 `hreflang` 상호 참조가 필수
- 같은 의미의 언어별 페이지끼리 서로 alternate 링크를 정확히 매핑해야 합니다.
- 기본 페이지를 지정하려면 `x-default`를 함께 제공합니다.

4. `robots.txt`는 크롤링 제어만 담당
- 인덱싱 제어는 canonical/noindex 등과 함께 운영해야 하며, robots만으로 완전한 인덱스 제어를 기대하면 안 됩니다.

## 2) MECHU SEO 설계 결정

### URL/locale 정책
- 지원 locale: `ko`, `en`, `ja`, `zh-Hant`
- 기본 fallback locale: `en`
- canonical 대상 경로:
  - `/{locale}/onboarding`
  - `/{locale}/preferences`
  - `/{locale}/results`
- `/{locale}/status`는 상태 안내 페이지로 `noindex` 처리

### canonical/hreflang 정책
- 각 locale 페이지는 자기 자신을 canonical로 가집니다.
- alternates는 4개 locale + `x-default`(=`/en/...`)를 제공합니다.
- canonical/alternate URL은 `NEXT_PUBLIC_SITE_URL` 기반으로 절대 URL 생성됩니다.

### robots/sitemap 정책
- `robots.txt`
  - `Allow: /`
  - `Disallow: /api`, `/api/`
  - `Sitemap: {NEXT_PUBLIC_SITE_URL}/sitemap.xml`
- `sitemap.xml`
  - 핵심 3개 경로(`onboarding/preferences/results`) x 4 locale = 12 URL
  - 각 URL에 locale alternate 링크 포함
- 엄격 모드:
  - `SEO_STRICT_SITE_URL=1` 또는 CI 환경에서는 `NEXT_PUBLIC_SITE_URL`이 누락/오류일 때 빌드를 실패시켜 잘못된 canonical 배포를 방지합니다.

## 3) 구현 파일

- SEO 메타 유틸: `lib/seo/metadata.ts`
- locale 페이지 메타:
  - `app/[locale]/onboarding/page.tsx`
  - `app/[locale]/preferences/page.tsx`
  - `app/[locale]/results/page.tsx`
  - `app/[locale]/status/page.tsx`
- locale 레이아웃 메타 베이스:
  - `app/[locale]/layout.tsx`
- 사이트맵: `app/sitemap.ts`
- robots: `app/robots.ts`

## 4) 운영 준비 체크리스트 (Search Console)

### A. 속성 생성
1. Search Console에서 **Domain property** 생성
2. DNS 공급자에서 TXT 레코드 추가
3. DNS 전파 후 Search Console에서 Verify

### B. 사이트맵 제출
1. 프로덕션 배포 후 `{SITE_URL}/sitemap.xml` 확인
2. Search Console > Sitemaps에 제출
3. 제출 상태(성공/경고) 확인

### C. 초기 인덱싱 점검
1. URL Inspection으로 핵심 경로 점검
  - `/ko/onboarding`, `/en/onboarding`, `/ja/onboarding`, `/zh-Hant/onboarding`
  - `/ko/preferences`, `/en/preferences`, `/ja/preferences`, `/zh-Hant/preferences`
  - `/ko/results`, `/en/results`, `/ja/results`, `/zh-Hant/results`
2. canonical 선택 결과/페이지 가져오기 성공 여부 확인

### D. 모니터링 루틴 (주 1회)
1. Indexing > Pages 오류 확인
2. Sitemaps 처리 상태 확인
3. Core Web Vitals 모바일/데스크톱 추세 확인
4. Mobile Usability/Enhancements 이슈 확인

## 5) Cloudflare 환경변수/배포 주의점

1. `NEXT_PUBLIC_SITE_URL`을 프로덕션 실도메인으로 설정
- 예: `https://mechu.app`
- 빌드/런타임에서 동일 값 유지 권장
2. `SEO_STRICT_SITE_URL=1` 활성화 권장
- CI/배포 시 site URL 누락을 조기 차단합니다.

3. 도메인 정규화
- `www`/non-`www` 중 하나를 canonical로 고정
- 나머지는 301 리다이렉트

4. HTTPS 강제
- Cloudflare SSL/TLS 설정에서 Always Use HTTPS 활성화

## 6) 트러블슈팅

1. Search Console에서 alternate/hreflang 오류
- locale URL 간 상호 alternate가 모두 존재하는지 확인
- canonical이 다른 locale로 잘못 지정되지 않았는지 확인

2. 사이트맵 제출 오류
- 사이트맵 URL 응답 코드(200) 확인
- robots에서 sitemap URL이 올바른지 확인
- `NEXT_PUBLIC_SITE_URL` 오탈자 확인

3. canonical이 localhost로 보이는 문제
- 프로덕션 환경에서 `NEXT_PUBLIC_SITE_URL`이 실제 도메인인지 확인
- Cloudflare 변수와 코드 기본값 차이 확인

## 7) 참고 링크

- Search Console 속성 추가: https://support.google.com/webmasters/answer/34592
- 소유권 인증: https://support.google.com/webmasters/answer/9008080
- 사이트맵 관리: https://support.google.com/webmasters/answer/7451001
- hreflang 가이드: https://developers.google.com/search/docs/specialty/international/localized-versions
- robots.txt 소개: https://developers.google.com/search/docs/crawling-indexing/robots/intro
- 사이트맵 가이드: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview
