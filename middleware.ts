import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, parseLocale, type Locale } from "@/lib/i18n/config";

function detectFromAcceptLanguage(header: string | null): Locale | undefined {
  if (!header) return undefined;
  const preferences = header
    .split(",")
    .map((raw) => raw.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean) as string[];

  for (const lang of preferences) {
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("ja")) return "ja";
    if (lang === "zh") return "zh-Hant";
    if (lang.startsWith("zh-hant")) return "zh-Hant";
    if (lang.startsWith("zh-tw") || lang.startsWith("zh-hk") || lang.startsWith("zh-mo")) {
      return "zh-Hant";
    }
    if (lang.startsWith("en")) return "en";
  }

  return undefined;
}

function detectFromIpCountry(request: NextRequest): Locale | undefined {
  const fromHeader = request.headers.get("cf-ipcountry") ?? request.headers.get("x-vercel-ip-country");
  const fromGeo = (request as unknown as { geo?: { country?: string } }).geo?.country;
  const raw = (fromHeader ?? fromGeo ?? "").trim().toUpperCase();
  if (!raw || raw === "XX" || raw === "T1") return undefined;

  if (raw === "KR") return "ko";
  if (raw === "JP") return "ja";
  if (raw === "TW" || raw === "HK" || raw === "MO") return "zh-Hant";
  return undefined;
}

function resolvePreferredLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  const cookieLocale = parseLocale(fromCookie);
  if (cookieLocale) return cookieLocale;

  const fromAcceptLanguage = detectFromAcceptLanguage(request.headers.get("accept-language"));
  if (fromAcceptLanguage) return fromAcceptLanguage;

  return detectFromIpCountry(request) ?? DEFAULT_LOCALE;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];
  const segmentLocale = parseLocale(firstSegment);

  if (segmentLocale) {
    if (firstSegment !== segmentLocale) {
      const chunks = pathname.split("/").filter(Boolean);
      const rest = chunks.slice(1).join("/");
      const url = request.nextUrl.clone();
      url.pathname = rest ? `/${segmentLocale}/${rest}` : `/${segmentLocale}`;
      const response = NextResponse.redirect(url);
      response.cookies.set(LOCALE_COOKIE, segmentLocale, { path: "/", sameSite: "lax" });
      return response;
    }

    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, segmentLocale, { path: "/", sameSite: "lax" });
    return response;
  }

  const locale = resolvePreferredLocale(request);
  const url = request.nextUrl.clone();
  const destination = pathname === "/" ? "/onboarding" : pathname;
  url.pathname = `/${locale}${destination}`;

  const response = NextResponse.redirect(url);
  response.cookies.set(LOCALE_COOKIE, locale, { path: "/", sameSite: "lax" });
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|.*\\..*).*)"],
};
