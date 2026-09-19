import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import GlassGreen from "@/components/ui/GlassGreen"; // 🍃 디자인 규칙 단일 스위치

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// ⚙️ 실제 도메인으로 바꿔야 함 → Vercel/.env.local 의 NEXT_PUBLIC_SITE_URL 로 설정
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://www.layboad.com";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "layboad — 실시간 수업 칠판",
  description: "PDF 교재 위에서 실시간으로 필기하고, 학생과 화면을 실시간으로 공유하는 온라인 수업 칠판",
  keywords: ["온라인 과외", "실시간 칠판", "화상 수업", "PDF 필기", "과외 칠판", "온라인 수업", "layboad"],
  appleWebApp: { capable: true, statusBarStyle: "default", title: "layboad" },
  openGraph: {
    title: "layboad — 실시간 수업 칠판",
    description: "PDF 교재 위에 실시간으로 필기하고 학생과 화면을 공유하는 온라인 수업 칠판",
    url: SITE_URL,
    siteName: "layboad",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "layboad — 실시간 수업 칠판" }],
    locale: "ko_KR",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "layboad — 실시간 수업 칠판",
    description: "PDF 교재 위에 실시간으로 필기하고 학생과 화면을 공유하는 온라인 수업 칠판",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        {/* 🍃 디자인 규칙 단일 스위치 — 이 한 줄 제거하면 전부 사라짐 */}
        <GlassGreen />
        <Analytics />
      </body>
    </html>
  );
}
