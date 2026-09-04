"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { modeOf } from "@/lib/nav";
import { useAuth } from "./LiffProvider";

/** แถบเมนูล่างแบบลอย — แท่งสีกรมท่า เมนูที่เปิดอยู่เป็นเม็ดยาสีขาว
 *
 * โชว์เฉพาะหน้าของ "โหมด" ที่เปิดอยู่ (บัญชี / หวย) — สลับโหมดที่หัวจอ
 * ⇒ ย้ายหน้าจาก Streamlit มาเพิ่มได้เรื่อย ๆ โดยแถบล่างไม่แน่นขึ้น
 */
export function Nav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const mode = modeOf(pathname);
  // คนที่ไม่ใช่ผู้ดูแลเข้าโหมดหวยไม่ได้อยู่แล้ว — กันกรณีพิมพ์ URL เอง
  const items = mode.adminOnly && !isAdmin ? [] : mode.items;
  if (items.length === 0) return null;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 px-3 pb-3">
      <div
        className="mx-auto flex max-w-md rounded-3xl px-1.5 py-2.5"
        style={{ background: "var(--nav-bg)", boxShadow: "0 12px 28px rgb(22 36 61 / 0.30)" }}
      >
        {items.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-[3px] py-0.5"
            >
              <span
                className="flex h-[29px] w-[44px] items-center justify-center rounded-full transition-colors"
                style={{ background: active ? "var(--nav-active-bg)" : "transparent" }}
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={active ? "var(--nav-active-text)" : "var(--nav-dim)"}
                  strokeWidth={active ? 2 : 1.9}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d={item.icon} />
                </svg>
              </span>
              <span
                className="text-[10.5px]"
                style={{
                  color: active ? "var(--nav-active-bg)" : "var(--nav-dim)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
