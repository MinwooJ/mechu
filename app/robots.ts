import type { MetadataRoute } from "next";

import { getMetadataBase } from "@/lib/seo/metadata";

export default function robots(): MetadataRoute.Robots {
  const base = getMetadataBase();

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/"],
        disallow: ["/api"],
      },
    ],
    sitemap: `${base.origin}/sitemap.xml`,
  };
}
