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
        <span
          className="emoji-tile size-6 text-[13px]"
          style={{ background: `color-mix(in srgb, ${color ?? "var(--accent)"} 38%, var(--card))` }}
        >
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
