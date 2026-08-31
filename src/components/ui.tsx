"use client";

import { useState } from "react";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { bankMark } from "@/lib/thai-banks";

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "success" | "warn" | "error";
  title?: string;
  children?: React.ReactNode;
}) {
  const palette = {
    info: { bg: "#e8f1fe", border: "#c8dcf8", text: "#2c5497" },
    success: { bg: "#e4f6ee", border: "#bee5d2", text: "#0b7a50" },
    warn: { bg: "#fff4e0", border: "#f3ddb0", text: "#9a6a00" },
    error: { bg: "#fdeaea", border: "#f5c2c4", text: "#b3282d" },
  }[tone];

  return (
    <div
      className="rounded-2xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

/** สีตัวอักษรบนป้ายธนาคาร — สีแบรนด์อ่อนอย่างเหลืองกรุงศรีต้องใช้ตัวหนังสือสีเข้ม */
function inkOn(hex: string): string {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.6 ? "#1a1a1a" : "#ffffff";
}

/** โลโก้ที่ลองโหลดแล้วไม่มีไฟล์ — จำไว้ทั้งหน้า จะได้ไม่ยิงซ้ำทุกแถว */
const missingBankLogos = new Set<string>();

/**
 * ไอคอนธนาคาร
 *
 * อยากได้โลโก้จริง ให้วางไฟล์เองที่ `public/banks/<ตัวย่อ>.png` (เช่น `scb.png`, `kbank.png`)
 * แล้วมันจะขึ้นเองทันที — ในโค้ดไม่ได้แนบโลโก้มาให้เพราะเป็นเครื่องหมายการค้าของธนาคาร
 * ไม่มีไฟล์ก็ใช้วงกลมสีประจำแบรนด์พร้อมตัวย่อแทน
 */
export function BankBadge({ name, size = 26 }: { name: string | null | undefined; size?: number }) {
  const mark = bankMark(name);
  const code = (mark?.short ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  const [logoMissing, setLogoMissing] = useState(() => !code || missingBankLogos.has(code));

  if (code && !logoMissing) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`/banks/${code}.png`}
        alt={name ?? ""}
        className="flex-none rounded-full object-contain"
        style={{ width: size, height: size, background: "#fff" }}
        onError={() => {
          missingBankLogos.add(code);
          setLogoMissing(true);
        }}
      />
    );
  }

  return (
    <span
      className="emoji-tile flex-none rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(7, size * 0.3),
        letterSpacing: "0.02em",
        background: mark?.color ?? "var(--accent-tint)",
        color: mark ? inkOn(mark.color) : "var(--muted)",
      }}
    >
      {mark?.short ?? "—"}
    </span>
  );
}

/** หัวเรื่องของหน้า พร้อมคำอธิบายบรรทัดรอง */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="page-title">{title}</h1>
        {subtitle ? <p className="page-sub truncate">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-center justify-between gap-2">
      <h2 className="card-title">{children}</h2>
      {action}
    </div>
  );
}

/** ปุ่มกลมเลือกช่วงเวลา/ตัวกรอง */
export function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" className={`chip${active ? " chip-active" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

/** การ์ดตัวเลขสรุป — ไอคอนในกล่องสีอ่อน + ตัวเลขใหญ่หนา */
export function StatCard({
  label,
  value,
  tone = "neutral",
  signed = false,
  raw,
  icon,
}: {
  label: string;
  value: number;
  tone?: "in" | "out" | "neutral";
  signed?: boolean;
  /** แสดงตัวเลขดิบ ๆ แทนจำนวนเงิน เช่น "จำนวนรายการ" */
  raw?: boolean;
  icon?: React.ReactNode;
}) {
  const tile =
    tone === "in"
      ? { bg: "var(--tint-in)", fg: "var(--color-money-in)" }
      : tone === "out"
        ? { bg: "var(--tint-out)", fg: "var(--color-money-out)" }
        : { bg: "var(--accent-tint)", fg: "var(--accent)" };

  // ตัวเลขเป็นสีเข้มแบบเดียวกันหมด — ยกเว้นยอดสุทธิ (signed) ที่บอกกำไร/ขาดทุนด้วยสี
  const color = signed
    ? value >= 0
      ? "var(--color-money-out)"
      : "var(--color-money-in)"
    : "var(--text)";

  return (
    <div className="card px-3.5 py-3">
      <div className="flex items-center gap-2">
        {icon ? (
          <span
            className="flex size-[30px] flex-none items-center justify-center rounded-[10px]"
            style={{ background: tile.bg, color: tile.fg }}
          >
            {icon}
          </span>
        ) : null}
        <p className="muted text-[11px] font-semibold">{label}</p>
      </div>
      <p className="display-num mt-2 text-[19px]" style={{ color }}>
        {raw ? value.toLocaleString("th-TH") : signed ? formatSigned(value) : formatBahtShort(value)}
      </p>
    </div>
  );
}

/** แถบสัดส่วนเงินเข้า/ออก ใช้ในหน้าสรุปยอด — แถบเป็นสี pastel */
export function BarRow({ value, max, tone }: { value: number; max: number; tone: "in" | "out" }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "in" ? "var(--pastel-in)" : "var(--pastel-out)";
  return (
    <div className="flex items-center gap-2">
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${width}%`, background: color }} />
      </div>
      <span className="tnum w-[76px] flex-none text-right text-[11px]" style={{ color: "var(--muted)" }}>
        {formatBahtShort(value)}
      </span>
    </div>
  );
}

/** พื้นหลังอ่อนของกล่อง emoji — เจือสีประจำเว็บลงบนสีการ์ด */
export function siteTint(color?: string | null): string {
  return `color-mix(in srgb, ${color ?? "var(--accent)"} 38%, var(--card))`;
}

/** ชื่อเว็บ — มี emoji เป็นกล่องสี pastel, ไม่มีก็เป็นจุดสีแบบเดิม */
export function SiteBadge({
  name,
  color,
  emoji,
}: {
  name: string;
  color?: string | null;
  emoji?: string | null;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
      {emoji ? (
        <span className="emoji-tile size-6 text-[13px]" style={{ background: siteTint(color) }}>
          {emoji}
        </span>
      ) : (
        <span className="size-2 flex-none rounded-full" style={{ background: color ?? "var(--dim)" }} />
      )}
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="muted inline-flex items-center gap-2 text-sm">
      <span
        className="inline-block size-[18px] animate-spin rounded-full border-[2.5px]"
        style={{ borderColor: "var(--accent-tint)", borderTopColor: "var(--accent)" }}
        aria-hidden
      />
      {label}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-7 text-center text-[13.5px]" style={{ color: "var(--dim)" }}>
      {children}
    </p>
  );
}

/** อวตารทรง blob — รูปโปรไฟล์ หรือวงตัวอักษรแรกของชื่อ */
export function AvatarCircle({
  name,
  src,
  size = 40,
}: {
  name: string | null | undefined;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt=""
        className="blob flex-none object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="blob flex flex-none items-center justify-center font-bold"
      style={{
        width: size,
        height: size,
        background: "var(--accent-tint)",
        color: "var(--accent)",
        fontSize: size * 0.4,
        fontFamily: "var(--font-prompt), var(--font-sans)",
      }}
    >
      {(name ?? "?").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
