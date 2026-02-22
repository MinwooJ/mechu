import "leaflet/dist/leaflet.css";
import "./globals.css";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { ReactNode } from "react";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "@/lib/i18n/config";
import { getMetadataBase } from "@/lib/seo/metadata";

export const metadata: Metadata = {
  metadataBase: getMetadataBase(),
  title: "mechu",
  description: "Location-based lunch and dinner recommendation.",
  icons: {
    icon: [
      { url: "/mechu_icon_16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/mechu_icon_32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/mechu_icon_180x180.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "icon", url: "/mechu_icon_512x512.png", sizes: "512x512", type: "image/png" }],
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
  const lang = isLocale(fromCookie) ? fromCookie : DEFAULT_LOCALE;

  return (
    <html lang={lang}>
      <body>{children}</body>
    </html>
  );
}
