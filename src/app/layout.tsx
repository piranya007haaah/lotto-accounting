import type { Metadata, Viewport } from "next";
import { LiffProvider } from "@/components/LiffProvider";
import { Nav } from "@/components/Nav";
import "./globals.css";

export const metadata: Metadata = {
  title: "บัญชีเว็บหวย",
  description: "บันทึกเงินเข้า-ออกเว็บหวยจากสลิป แล้วสรุปยอดรายวัน/รายเดือน",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#2d59c4",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
      <body className="min-h-dvh">
        <LiffProvider>
          <main className="mx-auto w-full max-w-md px-4 pt-4 pb-28">{children}</main>
          <Nav />
        </LiffProvider>
      </body>
    </html>
  );
}
