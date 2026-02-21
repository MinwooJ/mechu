"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import { LOCALE_NATIVE_LABEL, LOCALES, type Locale } from "@/lib/i18n/config";
import { useT } from "@/lib/i18n/client";
import { localeFromPathname, switchLocaleInPathname, withLocale } from "@/lib/i18n/routing";

type FlowHeaderProps = {
  overlay?: boolean;
};

export default function FlowHeader({ overlay = false }: FlowHeaderProps) {
  const t = useT();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement | null>(null);
  const locale = localeFromPathname(pathname);
  const query = searchParams.toString();
  const querySuffix = query ? `?${query}` : "";

  const homeHref = withLocale(locale, "/onboarding");
  const localeTargets: Array<{ locale: Locale; href: string }> = LOCALES.map((nextLocale) => ({
    locale: nextLocale,
    href: `${switchLocaleInPathname(pathname, nextLocale)}${querySuffix}`,
  }));

  useEffect(() => {
    setLangMenuOpen(false);
  }, [pathname, query]);

  useEffect(() => {
    if (!langMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const root = langMenuRef.current;
      if (!root) return;
      if (root.contains(event.target as Node)) return;
      setLangMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setLangMenuOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [langMenuOpen]);

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
        <div ref={langMenuRef} className={`flow-lang-switch${langMenuOpen ? " open" : ""}`}>
          <button
            type="button"
            className="flow-lang-toggle"
            aria-label={t("flow.langSwitcherAria")}
            aria-expanded={langMenuOpen}
            aria-haspopup="menu"
            onClick={() => setLangMenuOpen((prev) => !prev)}
          >
            <span>{LOCALE_NATIVE_LABEL[locale]}</span>
            <i aria-hidden>▾</i>
          </button>
          <div className="flow-lang-menu" role="menu" aria-label={t("flow.langSwitcherAria")}>
            {localeTargets.map((target) => (
              <Link
                key={target.locale}
                href={target.href}
                role="menuitem"
                className={target.locale === locale ? "active" : ""}
                aria-current={target.locale === locale ? "true" : undefined}
                onClick={() => setLangMenuOpen(false)}
              >
                <span>{LOCALE_NATIVE_LABEL[target.locale]}</span>
                {target.locale === locale ? <strong aria-hidden>✓</strong> : null}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      {langMenuOpen ? (
        <button
          type="button"
          className="flow-lang-backdrop"
          aria-label={t("common.close")}
          onClick={() => setLangMenuOpen(false)}
        />
      ) : null}
    </header>
  );
}
