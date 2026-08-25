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
      className="rounded-xl border px-3 py-2.5 text-sm"
      style={{ background: palette.bg, borderColor: palette.border, color: palette.text }}
    >
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={title ? "mt-1" : ""}>{children}</div> : null}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="text-sm font-bold">{children}</h2>
      {action}
    </div>
  );
}

/** การ์ดตัวเลขสรุป */
export function StatCard({
  label,
  value,
  tone = "neutral",
  signed = false,
}: {
  label: string;
  value: number;
  tone?: "in" | "out" | "neutral";
  signed?: boolean;
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
    <div className="card px-3 py-2.5">
      <p className="muted text-[11px] font-medium">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums" style={{ color }}>
        {signed ? formatSigned(value) : formatBahtShort(value)}
      </p>
    </div>
  );
}

export function SiteBadge({ name, color }: { name: string; color?: string | null }) {
  const dot = color ?? "#9ca3af";
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
      <span className="size-2 rounded-full" style={{ background: dot }} />
      {name}
    </span>
  );
}

export function Spinner({ label }: { label?: string }) {
  return (
    <span className="muted inline-flex items-center gap-2 text-sm">
      <span
        className="inline-block size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        aria-hidden
      />
      {label}
    </span>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="muted py-8 text-center text-sm">{children}</p>;
}
