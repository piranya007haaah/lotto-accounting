import type { Metadata, Viewport } from "next";
import { Anuphan, Archivo_Black, Prompt } from "next/font/google";
import { LiffProvider } from "@/components/LiffProvider";
import { ModeSwitch } from "@/components/ModeSwitch";
import { Nav } from "@/components/Nav";
import "./globals.css";

const anuphan = Anuphan({ subsets: ["thai", "latin"], variable: "--font-anuphan" });

const prompt = Prompt({
  subsets: ["thai", "latin"],
  weight: ["500", "600", "700"],
  variable: "--font-prompt",
});

/* ใช้กับตัวเลขโชว์ใหญ่ ๆ เท่านั้น (ตัวเลขเป็นละติน) */
const archivoBlack = Archivo_Black({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-archivo",
});

export const metadata: Metadata = {
  title: "บัญชีเว็บหวย",
  description: "บันทึกเงินเข้า-ออกเว็บหวยจากสลิป แล้วสรุปยอดรายวัน/รายเดือน",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#edf2f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c1220" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${anuphan.variable} ${prompt.variable} ${archivoBlack.variable}`}>
      <body className="min-h-dvh">
        <LiffProvider>
          <main className="mx-auto w-full max-w-md px-4 pt-4 pb-28">
            <ModeSwitch />
            {children}
          </main>
          <Nav />
        </LiffProvider>
      </body>
    </html>
  );
}
