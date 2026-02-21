import { NextRequest, NextResponse } from "next/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";

function detectFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const preferences = header
    .split(",")
    .map((raw) => raw.trim().split(";")[0]?.toLowerCase())
    .filter(Boolean) as string[];

  for (const lang of preferences) {
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("en")) return "en";
  }

  return DEFAULT_LOCALE;
}

function resolvePreferredLocale(request: NextRequest): Locale {
  const fromCookie = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return detectFromAcceptLanguage(request.headers.get("accept-language"));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split("/").filter(Boolean)[0];

  if (isLocale(firstSegment)) {
    const response = NextResponse.next();
    response.cookies.set(LOCALE_COOKIE, firstSegment, { path: "/", sameSite: "lax" });
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
