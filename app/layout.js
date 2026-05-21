import { Inter } from "next/font/google";
import "./globals.css";
import AppShell from "./components/AppShell";
import Providers from "./providers";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
});

export const metadata = {
  title: "Tổng hợp báo lỗi - PKT AMJ",
  description: "Hệ thống tổng hợp thống kê lỗi sản xuất AMJ JSC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="vi" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-[family-name:var(--font-inter)]">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
