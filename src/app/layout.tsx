import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TagDoctor - 광고 트래킹 진단 도구",
  description:
    "URL만 입력하면 메타 픽셀, GA4, 네이버 전환추적, 카카오 픽셀 상태를 1분 안에 진단합니다",
  openGraph: {
    title: "TagDoctor - 광고 트래킹 진단 도구",
    description:
      "내 사이트 광고 트래킹, 지금 제대로 되고 있나요? 무료 진단 시작",
    type: "website",
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
