"use client";

import { formatBahtShort, formatSigned } from "@/lib/format";

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
    info: { bg: "#eef4ff", border: "#c7d8ff", text: "#24479c" },
    success: { bg: "#ecfdf5", border: "#a7f3d0", text: "#047857" },
    warn: { bg: "#fffbeb", border: "#fde68a", text: "#b45309" },
    error: { bg: "#fef2f2", border: "#fecaca", text: "#b91c1c" },
  }[tone];

  return (
    <div
      className="rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      {title ? <p className="font-bold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
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

/** การ์ดตัวเลขสรุป */
export function StatCard({
  label,
  value,
  tone = "neutral",
  signed = false,
  raw,
}: {
  label: string;
  value: number;
  tone?: "in" | "out" | "neutral";
  signed?: boolean;
  /** แสดงตัวเลขดิบ ๆ แทนจำนวนเงิน เช่น "จำนวนรายการ" */
  raw?: boolean;
}) {
  const color =
    tone === "in"
      ? "var(--color-money-in)"
      : tone === "out"
        ? "var(--color-money-out)"
        : value < 0
          ? "var(--color-money-in)"
          : "var(--text)";

  return (
    <div className="card px-3.5 py-3">
      <p className="muted text-[11px] font-medium">{label}</p>
      <p className="tnum mt-[3px] text-lg font-bold" style={{ color }}>
        {raw ? value.toLocaleString("th-TH") : signed ? formatSigned(value) : formatBahtShort(value)}
      </p>
    </div>
  );
}

/** แถบสัดส่วนเงินเข้า/ออก ใช้ในหน้าสรุปยอด */
export function BarRow({ value, max, tone }: { value: number; max: number; tone: "in" | "out" }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  const color = tone === "in" ? "var(--color-money-in)" : "var(--color-money-out)";
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

export function SiteBadge({ name, color }: { name: string; color?: string | null }) {
  const dot = color ?? "var(--dim)";
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
      <span className="size-2 flex-none rounded-full" style={{ background: dot }} />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="muted inline-flex items-center gap-2 text-sm">
      <span
        className="inline-block size-[18px] animate-spin rounded-full border-[2.5px]"
        style={{ borderColor: "var(--color-brand-200)", borderTopColor: "var(--color-brand-600)" }}
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

/** วงกลมตัวอักษรแรกของชื่อ ใช้แทนรูปโปรไฟล์ที่ไม่มี */
export function AvatarCircle({
  name,
  src,
  size = 38,
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
        className="flex-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex flex-none items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        background: "var(--color-brand-100)",
        color: "var(--color-brand-700)",
        fontSize: size * 0.4,
      }}
    >
      {(name ?? "?").trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
