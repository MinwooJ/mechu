"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LOCALES, type Locale } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/client";
import { localeFromPathname, switchLocaleInPathname, withLocale } from "@/lib/i18n/routing";

type FlowHeaderProps = {
  overlay?: boolean;
};

export default function FlowHeader({ overlay = false }: FlowHeaderProps) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const locale = localeFromPathname(pathname);
  const query = searchParams.toString();
  const querySuffix = query ? `?${query}` : "";

  const homeHref = withLocale(locale, "/onboarding");
  const localeTargets: Array<{ locale: Locale; href: string }> = LOCALES.map((nextLocale) => ({
    locale: nextLocale,
    href: `${switchLocaleInPathname(pathname, nextLocale)}${querySuffix}`,
  }));

  return (
    <header className={`flow-header${overlay ? " overlay" : ""}`}>
      <Link href={homeHref} className="flow-brand" aria-label={t("flow.brandHomeAria")}>
        <img src="/mechu_icon_512x512.png" alt="" className="flow-brand-icon" aria-hidden />
        <span className="flow-brand-wordmark">
          <img src="/brand/mechu_white_logo.webp" alt="mechu" className="flow-brand-image" />
        </span>
      </Link>

      <nav className="flow-nav">
        <Link href={homeHref}>{t("common.home")}</Link>
        <div className="flow-lang-switch" role="group" aria-label={t("flow.langSwitcherAria")}>
          {localeTargets.map((target) => (
            <Link
              key={target.locale}
              href={target.href}
              className={target.locale === locale ? "active" : ""}
              aria-current={target.locale === locale ? "true" : undefined}
            >
              {target.locale === "ko" ? t("common.langKo") : t("common.langEn")}
            </Link>
          ))}
        </div>
      </nav>
    </header>
  );
}
