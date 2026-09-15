import type { MetadataRoute } from "next";

// PWA manifest — 홈 화면에 추가 시 브라우저 UI 없는 전체화면(standalone)으로 실행됨
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "layboad — 실시간 수업 칠판",
    short_name: "layboad",
    description: "PDF 교재 위 실시간 수업 칠판",
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#ffffff",
    theme_color: "#77B034",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
