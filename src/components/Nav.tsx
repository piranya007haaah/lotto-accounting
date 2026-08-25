"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "บันทึก", icon: "＋" },
  { href: "/summary", label: "สรุปยอด", icon: "▦" },
  { href: "/history", label: "รายการ", icon: "☰" },
  { href: "/sites", label: "เว็บ", icon: "★" },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur"
      style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--card) 92%, transparent)" }}
    >
      <div className="mx-auto flex max-w-md">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-1 flex-col items-center gap-0.5 py-3 text-xs font-medium"
              style={{ color: active ? "var(--color-brand-600)" : "var(--muted)" }}
            >
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
