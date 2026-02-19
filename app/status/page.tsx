import Link from "next/link";

const COPY = {
  need_location: {
    title: "위치 권한이 필요해요",
    body: "위치 권한을 허용하면 주변 추천을 받을 수 있어요.",
    primary: "온보딩으로 이동",
    href: "/onboarding",
  },
  unsupported: {
    title: "아직 서비스 준비 중이에요",
    body: "현재 이 지역은 지원 대상이 아니에요. 국가 코드를 바꿔 다시 시도해 주세요.",
    primary: "설정 다시하기",
    href: "/preferences",
  },
  quota_exceeded: {
    title: "오늘 한도를 모두 사용했어요",
    body: "무료 추천 한도를 소진했어요. 내일 다시 시도해 주세요.",
    primary: "설정 화면으로",
    href: "/preferences",
  },
  empty: {
    title: "조건에 맞는 가게가 없어요",
    body: "반경을 넓히거나 무드를 탐험으로 바꾸면 더 많은 결과를 볼 수 있어요.",
    primary: "조건 조정",
    href: "/preferences",
  },
  error: {
    title: "연결이 불안정해요",
    body: "네트워크 상태를 확인하고 다시 시도해 주세요.",
    primary: "다시 시도",
    href: "/results",
  },
} as const;

type StatusKind = keyof typeof COPY;

export default async function StatusPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string }>;
}) {
  const params = await searchParams;
  const kind = (params.kind as StatusKind) || "error";
  const content = COPY[kind] ?? COPY.error;

  return (
    <main className="flow-page status">
      <section className="status-grid">
        <article className="status-card">
          <p className="chip">STATUS</p>
          <h1>{content.title}</h1>
          <p>{content.body}</p>
          <div className="btn-row">
            <Link className="btn-primary" href={content.href}>
              {content.primary}
            </Link>
            <Link className="btn-ghost" href="/results">
              결과 다시 보기
            </Link>
          </div>
        </article>

        <article className="status-card muted-card">
          <h2>도움말</h2>
          <ul>
            <li>위치 권한을 허용하면 결과 품질이 좋아집니다.</li>
            <li>500m에서 결과가 적으면 1km 또는 3km를 사용하세요.</li>
            <li>탐험 추천은 숨은 가게를 더 많이 노출합니다.</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
