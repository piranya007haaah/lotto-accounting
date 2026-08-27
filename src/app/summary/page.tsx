"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, BarRow, Chip, EmptyState, PageHeader, SectionTitle, Spinner, StatCard } from "@/components/ui";
import { formatSigned } from "@/lib/format";
import { currentMonthKey } from "@/lib/thai-date";
import type { SummaryBucket, SummaryResponse } from "@/lib/types";

type RangeMode = "today" | "yesterday" | "last7" | "month" | "year";

const MODES: Array<{ value: RangeMode; label: string }> = [
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "last7", label: "7 วัน" },
  { value: "month", label: "รายเดือน" },
  { value: "year", label: "ทั้งปี" },
];

function SummaryRow({ bucket, max }: { bucket: SummaryBucket & { color?: string | null }; max: number }) {
  return (
    <div className="row py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
          {bucket.color ? (
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

export default function SummaryPage() {
  const { api } = useAuth();
  const [mode, setMode] = useState<RangeMode>("month");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [year, setYear] = useState(() => Number(currentMonthKey().slice(0, 4)));
  const [data, setData] = useState<(SummaryResponse & { label: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="space-y-3.5">
      <PageHeader title="สรุปยอด" subtitle={data?.label ?? "—"} />

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
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="เงินเข้าเว็บ" value={data.totals.deposit} tone="in" />
            <StatCard label="เงินออกจากเว็บ" value={data.totals.withdraw} tone="out" />
            <StatCard label="กำไร / ขาดทุน" value={data.totals.net} signed />
            <StatCard label="จำนวนรายการ" value={data.totals.count} raw />
          </div>

          <section className="card p-4">
            <SectionTitle>แยกตามเว็บ</SectionTitle>
            {data.bySite.length === 0 ? (
              <EmptyState>ยังไม่มีรายการในช่วงนี้</EmptyState>
            ) : (
              <div>
                {data.bySite.map((bucket) => (
                  <SummaryRow key={bucket.key} bucket={bucket} max={maxSite} />
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
            แถบสีแดง = เงินเข้าเว็บ · แถบสีเขียว = เงินออกจากเว็บ · ตัวเลขขวา = กำไร/ขาดทุน
          </p>
        </>
      ) : null}
    </div>
  );
}
