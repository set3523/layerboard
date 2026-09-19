import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.layboad.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // 비공개·세션 페이지는 색인 제외 (검색에 뜰 필요 없음)
      disallow: ["/dashboard", "/room/", "/join/", "/billing/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
