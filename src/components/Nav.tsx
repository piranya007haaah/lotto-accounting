"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./LiffProvider";

/** เส้น path ของไอคอน — วาดบน viewBox 24×24 แบบเส้นขอบอย่างเดียว */
const ITEMS = [
  { href: "/", label: "บันทึก", icon: "M12 5v14M5 12h14" },
  {
    href: "/pairs",
    label: "จับคู่",
    icon: "M4 7h7v10H4zM13 7h7v10h-7M11 12h2",
  },
  { href: "/summary", label: "สรุปยอด", icon: "M4 20h16M7 16v-5M12 16V7M17 16v-9" },
  { href: "/history", label: "รายการ", icon: "M4 6h16M4 12h16M4 18h10" },
  {
    href: "/sites",
    label: "เว็บ",
    icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c-2.4 2.8-2.4 15.2 0 18M12 3c2.4 2.8 2.4 15.2 0 18",
  },
] as const;

const ADMIN_ITEM = {
  href: "/admin",
  label: "สมาชิก",
  icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
} as const;

/** แถบเมนูล่างแบบลอย — แท่งสีกรมท่า เมนูที่เปิดอยู่เป็นเม็ดยาสีขาว */
export function Nav() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const items = isAdmin ? [...ITEMS, ADMIN_ITEM] : ITEMS;

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
