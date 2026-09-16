import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "墨枝",
  description: "长篇小说创作台",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
