"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import {
  Alert,
  BarRow,
  Chip,
  EmptyState,
  PageHeader,
  SectionTitle,
  siteTint,
  Spinner,
  StatCard,
} from "@/components/ui";
import { formatSigned } from "@/lib/format";
import { currentMonthKey } from "@/lib/thai-date";
import type { BankBucket, SiteRow, SummaryBucket, SummaryResponse } from "@/lib/types";

type RangeMode = "today" | "yesterday" | "last7" | "month" | "year";

const MODES: Array<{ value: RangeMode; label: string }> = [
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "last7", label: "7 วัน" },
  { value: "month", label: "รายเดือน" },
  { value: "year", label: "ทั้งปี" },
];

/* ไอคอนเส้นบนการ์ดสถิติ — วาดบน viewBox 24×24 */
function StatIcon({ d }: { d: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

function SummaryRow({
  bucket,
  max,
  emoji,
}: {
  bucket: SummaryBucket & { color?: string | null };
  max: number;
  emoji?: string | null;
}) {
  return (
    <div className="row py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
          {emoji ? (
            <span className="emoji-tile size-6 text-[13px]" style={{ background: siteTint(bucket.color) }}>
              {emoji}
            </span>
          ) : bucket.color ? (
            <span className="size-2 flex-none rounded-full" style={{ background: bucket.color }} />
          ) : null}
          <span className="truncate">{bucket.label}</span>
        </span>
        <span
          className="tnum flex-none text-[13.5px] font-bold"
          style={{ color: bucket.net >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
        >
          {formatSigned(bucket.net)}
        </span>
      </div>
      <div className="mt-1.5 flex flex-col gap-1">
        <BarRow value={bucket.deposit} max={max} tone="in" />
        <BarRow value={bucket.withdraw} max={max} tone="out" />
      </div>
    </div>
  );
}

/** เงินที่ถอนออกจากเว็บ เข้าบัญชีธนาคารไหนไปเท่าไหร่ */
function BankRow({ bucket, max }: { bucket: BankBucket; max: number }) {
  return (
    <div className="row py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-semibold">{bucket.key}</span>
        <span className="dim flex-none text-[11px]">{bucket.count} รายการ</span>
      </div>
      <div className="mt-1.5">
        <BarRow value={bucket.amount} max={max} tone="out" />
      </div>
    </div>
  );
}

export default function SummaryPage() {
  const { api } = useAuth();
  const [mode, setMode] = useState<RangeMode>("month");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [year, setYear] = useState(() => Number(currentMonthKey().slice(0, 4)));
  const [data, setData] = useState<(SummaryResponse & { label: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** emoji ของแต่ละเว็บ (key = site id) — โหลดแยก ไม่ต้องรอ ไม่บล็อกสรุปยอด */
  const [siteEmoji, setSiteEmoji] = useState<Record<string, string | null>>({});

  useEffect(() => {
    api<{ sites: SiteRow[] }>("/api/sites?all=1")
      .then((res) => setSiteEmoji(Object.fromEntries(res.sites.map((s) => [s.id, s.emoji ?? null]))))
      .catch(() => undefined);
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query =
        mode === "month"
          ? `month=${month}`
          : mode === "year"
            ? `from=${year}-01-01&to=${year}-12-31`
            : `range=${mode}`;
      setData(await api<SummaryResponse & { label: string }>(`/api/summary?${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดสรุปยอดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api, mode, month, year]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxSite = Math.max(1, ...(data?.bySite ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxMonth = Math.max(1, ...(data?.byMonth ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxBank = Math.max(1, ...(data?.byBank ?? []).map((b) => b.amount));

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="สรุปยอด"
        subtitle={data ? `${data.label} · ${data.totals.count} รายการ` : "—"}
      />

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {MODES.map((item) => (
          <Chip key={item.value} active={mode === item.value} onClick={() => setMode(item.value)}>
            {item.label}
          </Chip>
        ))}
      </div>

      {mode === "month" ? (
        <input
          type="month"
          className="field"
          value={month}
          onChange={(event) => setMonth(event.target.value)}
        />
      ) : null}

      {mode === "year" ? (
        <select className="field" value={year} onChange={(event) => setYear(Number(event.target.value))}>
          {Array.from({ length: 6 }, (_, index) => new Date().getFullYear() - index).map((value) => (
            <option key={value} value={value}>
              พ.ศ. {value + 543}
            </option>
          ))}
        </select>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <Spinner label="กำลังโหลด…" /> : null}

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <StatCard
              label="เงินเข้าเว็บ"
              value={data.totals.deposit}
              tone="in"
              icon={<StatIcon d="M12 5v14M5 12l7 7 7-7" />}
            />
            <StatCard
              label="เงินออกจากเว็บ"
              value={data.totals.withdraw}
              tone="out"
              icon={<StatIcon d="M12 19V5M5 12l7-7 7 7" />}
            />
            <div className="col-span-2">
              <StatCard
                label="กำไร / ขาดทุน"
                value={data.totals.net}
                signed
                icon={<StatIcon d="M3 17l6-6 4 4 8-8M14 7h7v7" />}
              />
            </div>
          </div>

          <section className="card p-4">
            <SectionTitle>เงินเข้าบัญชี แยกตามธนาคาร</SectionTitle>
            {data.byBank.length === 0 ? (
              <EmptyState>ยังไม่มีรายการเงินออกจากเว็บในช่วงนี้</EmptyState>
            ) : (
              <div>
                {data.byBank.map((bucket) => (
                  <BankRow key={bucket.key} bucket={bucket} max={maxBank} />
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <SectionTitle>แยกตามเว็บ</SectionTitle>
            {data.bySite.length === 0 ? (
              <EmptyState>ยังไม่มีรายการในช่วงนี้</EmptyState>
            ) : (
              <div>
                {data.bySite.map((bucket) => (
                  <SummaryRow key={bucket.key} bucket={bucket} max={maxSite} emoji={siteEmoji[bucket.siteId]} />
                ))}
              </div>
            )}
          </section>

          {data.byMonth.length > 1 ? (
            <section className="card p-4">
              <SectionTitle>แยกตามเดือน</SectionTitle>
              <div>
                {data.byMonth.map((bucket) => (
                  <SummaryRow key={bucket.key} bucket={bucket} max={maxMonth} />
                ))}
              </div>
            </section>
          ) : null}

          {data.byDay.length > 1 ? (
            <section className="card p-4">
              <SectionTitle>แยกตามวัน</SectionTitle>
              <div>
                {data.byDay.map((bucket) => (
                  <SummaryRow key={bucket.key} bucket={bucket} max={maxDay} />
                ))}
              </div>
            </section>
          ) : null}

          <p className="dim text-center text-[11px]">
            แถบชมพู = เงินเข้าเว็บ · แถบเขียวมินต์ = เงินออกจากเว็บ · ตัวเลขขวา = กำไร/ขาดทุน
          </p>
        </>
      ) : null}
    </div>
  );
}
