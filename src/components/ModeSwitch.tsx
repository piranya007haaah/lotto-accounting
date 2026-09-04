"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_PAGE, modeOf, modesFor } from "@/lib/nav";
import { useAuth } from "./LiffProvider";

/**
 * สลับระหว่าง "บัญชี" กับ "หวย" — แถบล่างเปลี่ยนทั้งชุดตามที่เลือก
 *
 * อยู่บนสุดของทุกหน้า (เรียกจาก layout) · คนที่ไม่ใช่ผู้ดูแลมีโหมดเดียว
 * จึงไม่ต้องโชว์ปุ่มสลับให้รก — แต่ยังโชว์ปุ่ม "สมาชิก" ให้ผู้ดูแลเสมอ
 * เพราะย้ายออกจากแถบล่างมาแล้ว (ไม่ได้ใช้บ่อยพอจะกินที่ในแถบ)
 */
export function ModeSwitch() {
  const pathname = usePathname();
  const { isAdmin, canViewLottery } = useAuth();
  const modes = modesFor({ canViewLottery });
  const current = modeOf(pathname);
  if (modes.length < 2 && !isAdmin) return null;

  return (
    <div className="mb-3 flex items-center gap-1.5">
      {modes.length > 1
        ? modes.map((mode) => {
            const active = mode.key === current.key && pathname !== ADMIN_PAGE.href;
            // ไปหน้าแรกของโหมดนั้นเสมอ — จำหน้าล่าสุดของแต่ละโหมดไว้จะเดายาก
            // ว่ากดแล้วจะไปโผล่ไหน (และ back ของเบราว์เซอร์จะงงตาม)
            return (
              <Link
                key={mode.key}
                href={mode.items[0].href}
                aria-current={active ? "page" : undefined}
                className="rounded-full px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                style={{
                  background: active ? "var(--ink-btn)" : "var(--card)",
                  color: active ? "var(--ink-btn-text)" : "var(--muted)",
                  border: `1px solid ${active ? "var(--ink-btn)" : "var(--line)"}`,
                }}
              >
                <span aria-hidden="true">{mode.emoji}</span> {mode.label}
              </Link>
            );
          })
        : null}

      {isAdmin ? (
        <Link
          href={ADMIN_PAGE.href}
          aria-label={ADMIN_PAGE.label}
          aria-current={pathname === ADMIN_PAGE.href ? "page" : undefined}
          className="ml-auto flex size-[34px] items-center justify-center rounded-full transition-colors"
          style={{
            background: pathname === ADMIN_PAGE.href ? "var(--ink-btn)" : "var(--card)",
            border: `1px solid ${pathname === ADMIN_PAGE.href ? "var(--ink-btn)" : "var(--line)"}`,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke={pathname === ADMIN_PAGE.href ? "var(--ink-btn-text)" : "var(--muted)"}
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={ADMIN_PAGE.icon} />
          </svg>
        </Link>
      ) : null}
    </div>
  );
}
