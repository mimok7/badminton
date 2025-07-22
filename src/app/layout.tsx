import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import NotificationInitializer from "@/components/NotificationInitializer";
import RealtimeNotifications from "@/components/RealtimeNotifications";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "라켓 뚱보단",
  description: "참가자들로 경기를 자동으로 생성합니다.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        {/* 배드민턴 SVG 파비콘 */}
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 48 48'%3E%3Cellipse cx='24' cy='40' rx='8' ry='4' fill='%23F472B6'/%3E%3Crect x='21' y='10' width='6' height='24' rx='3' fill='%23A21CAF'/%3E%3Cpath d='M24 10L16 4M24 10L32 4' stroke='%23F472B6' stroke-width='2' stroke-linecap='round'/%3E%3Ccircle cx='16' cy='4' r='2' fill='%23F472B6'/%3E%3Ccircle cx='32' cy='4' r='2' fill='%23F472B6'/%3E%3C/svg%3E"
        />
      </head>
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        <NotificationInitializer />
        <RealtimeNotifications />
        <Header />
        <main>{children}</main>
      </body>
    </html>
  );
}