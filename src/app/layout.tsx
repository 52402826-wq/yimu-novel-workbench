import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "乙木",
  description: "本地小说创作工作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
