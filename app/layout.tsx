import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Shorts Studio | 쇼츠 자동화",
  description: "소재 반응을 점수화하고 쇼츠 대본과 자막 초안을 검수하는 작업 공간."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}

