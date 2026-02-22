"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

import FlowHeader from "@/app/components/flow-header";
import { useLocaleHref, useT } from "@/lib/i18n/client";

type StatusKind = "need_location" | "unsupported" | "empty" | "error";

const PRIMARY_PATH: Record<StatusKind, string> = {
  need_location: "/onboarding",
  unsupported: "/preferences",
  empty: "/preferences",
  error: "/results",
};

export default function StatusPage() {
  const searchParams = useSearchParams();
  const t = useT();
  const toLocale = useLocaleHref();

  const kind = (searchParams.get("kind") as StatusKind | null) ?? "error";
  const safeKind: StatusKind = ["need_location", "unsupported", "empty", "error"].includes(kind)
    ? kind
    : "error";

  return (
    <main className="flow-page status">
      <FlowHeader />
      <section className="status-grid section-shell">
        <article className="status-card">
          <p className="chip">{t("status.chip")}</p>
          <h1>{t(`status.${safeKind}.title`)}</h1>
          <p>{t(`status.${safeKind}.body`)}</p>
          <div className="btn-row">
            <Link className="btn-primary" href={toLocale(PRIMARY_PATH[safeKind])}>
              {t(`status.${safeKind}.primary`)}
            </Link>
            <Link className="btn-ghost" href={toLocale("/results")}>
              {t("status.viewResultsAgain")}
            </Link>
            {safeKind === "empty" ? (
              <Link className="btn-ghost" href={toLocale("/onboarding")}>
                {t("status.changeLocation")}
              </Link>
            ) : null}
          </div>
        </article>

        <article className="status-card muted-card">
          <h2>{t("status.helpTitle")}</h2>
          <ul>
            <li>{t("status.help1")}</li>
            <li>{t("status.help2")}</li>
            <li>{t("status.help3")}</li>
          </ul>
        </article>
      </section>
    </main>
  );
}
