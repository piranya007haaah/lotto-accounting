"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { OwnerPicker } from "@/components/OwnerPicker";
import {
  Alert,
  AvatarCircle,
  BankBadge,
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
import type { BankBucket, OwnerRef, SiteRow, SummaryBucket, SummaryResponse } from "@/lib/types";

type RangeMode = "today" | "yesterday" | "last7" | "month" | "year";

const MODES: Array<{ value: RangeMode; label: string }> = [
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "last7", label: "7 วัน" },
  { value: "month", label: "รายเดือน" },
  { value: "year", label: "ทั้งปี" },
];

/** เลือกดูทีละอย่าง — โชว์พร้อมกันหมดแล้วหน้ายาวจนหาไม่เจอ */
type Breakdown = "site" | "bank" | "day" | "month";

const BREAKDOWNS: Array<{ value: Breakdown; label: string }> = [
  { value: "bank", label: "ตามธนาคาร" },
  { value: "site", label: "ตามเว็บ" },
  { value: "day", label: "ตามวัน" },
  { value: "month", label: "ตามเดือน" },
];

/** แถวแรก ๆ พอให้เห็นภาพ ที่เหลือกดดูเพิ่มได้ */
const LIST_CAP = 8;

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

/** รูปโปรไฟล์ซ้อนกันเล็ก ๆ — ใช้บอกว่าใครเล่นเว็บนี้บ้างตอนดูรวมทุกคน */
function OwnerStack({ owners }: { owners: OwnerRef[] }) {
  if (owners.length === 0) return null;
  const shown = owners.slice(0, 4);
  return (
    <span className="flex flex-none items-center">
      {shown.map((owner, index) => (
        <span key={owner.id} style={{ marginLeft: index === 0 ? 0 : -5 }}>
          <AvatarCircle name={owner.name} src={owner.picture} size={16} />
        </span>
      ))}
      {owners.length > shown.length ? (
        <span className="dim ml-1 text-[10px]">+{owners.length - shown.length}</span>
      ) : null}
    </span>
  );
}

function SummaryRow({
  bucket,
  max,
  emoji,
  owners,
}: {
  bucket: SummaryBucket & { color?: string | null };
  max: number;
  emoji?: string | null;
  owners?: OwnerRef[];
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
          {owners && owners.length > 0 ? <OwnerStack owners={owners} /> : null}
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

/** บัญชีธนาคารเป็นของใครของมัน — ดูรวมทุกคนจึงต้องแยกหัวข้อตามคนก่อน */
function BankGroups({ buckets, max, showOwner }: { buckets: BankBucket[]; max: number; showOwner: boolean }) {
  const groups = new Map<string, { owner: OwnerRef; items: BankBucket[] }>();
  for (const bucket of buckets) {
    const group = groups.get(bucket.owner.id) ?? { owner: bucket.owner, items: [] };
    group.items.push(bucket);
    groups.set(bucket.owner.id, group);
  }

  return (
    <div>
      {[...groups.values()].map((group) => (
        <div key={group.owner.id}>
          {showOwner ? (
            <div className="mt-2.5 mb-0.5 flex items-center gap-2 first:mt-0">
              <AvatarCircle name={group.owner.name} src={group.owner.picture} size={18} />
              <span className="muted text-[12px] font-bold">{group.owner.name ?? "(ไม่ทราบชื่อ)"}</span>
            </div>
          ) : null}
          {group.items.map((bucket) => (
            <BankRow key={`${bucket.owner.id}|${bucket.key}`} bucket={bucket} max={max} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** บัญชีธนาคารของเราแต่ละธนาคาร มีเงินออกไปเข้าเว็บและรับกลับมาเท่าไหร่ */
function BankRow({ bucket, max }: { bucket: BankBucket; max: number }) {
  return (
    <div className="row py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13.5px] font-semibold">
          <BankBadge name={bucket.key} size={26} />
          <span className="truncate">{bucket.key}</span>
        </span>
        <span
          className="tnum flex-none text-[13.5px] font-bold"
          style={{
            color:
              bucket.withdraw - bucket.deposit >= 0
                ? "var(--color-money-out)"
                : "var(--color-money-in)",
          }}
        >
          {formatSigned(bucket.withdraw - bucket.deposit)}
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
  const { api, viewOwner } = useAuth();
  const [mode, setMode] = useState<RangeMode>("month");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [year, setYear] = useState(() => Number(currentMonthKey().slice(0, 4)));
  const [data, setData] = useState<(SummaryResponse & { label: string }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** emoji ของแต่ละเว็บ (key = site id) — โหลดแยก ไม่ต้องรอ ไม่บล็อกสรุปยอด */
  const [siteEmoji, setSiteEmoji] = useState<Record<string, string | null>>({});
  const [breakdown, setBreakdown] = useState<Breakdown>("bank");
  const [showAll, setShowAll] = useState(false);

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
      const owner = viewOwner ? `&ownerId=${viewOwner.id}` : "";
      setData(await api<SummaryResponse & { label: string }>(`/api/summary?${query}${owner}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดสรุปยอดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api, mode, month, year, viewOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  // เปลี่ยนมุมมองแล้วเริ่มนับแถวใหม่ ไม่ค้างสถานะ "ดูทั้งหมด" ของอันก่อน
  useEffect(() => setShowAll(false), [breakdown, mode, month, year, viewOwner]);

  const maxDay = Math.max(1, ...(data?.byDay ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxSite = Math.max(1, ...(data?.bySite ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxMonth = Math.max(1, ...(data?.byMonth ?? []).map((b) => Math.max(b.deposit, b.withdraw)));
  const maxBank = Math.max(1, ...(data?.byBank ?? []).map((b) => Math.max(b.deposit, b.withdraw)));

  // แถวของมุมมองที่เลือกอยู่ — ตัดให้สั้นก่อน แล้วค่อยกดดูทั้งหมดเอง
  const allRows =
    breakdown === "site"
      ? (data?.bySite ?? [])
      : breakdown === "bank"
        ? (data?.byBank ?? [])
        : breakdown === "day"
          ? (data?.byDay ?? [])
          : (data?.byMonth ?? []);
  const rows = showAll ? allRows : allRows.slice(0, LIST_CAP);
  const hiddenCount = allRows.length - rows.length;
  const bankOwners = new Set((data?.byBank ?? []).map((bucket) => bucket.owner.id)).size;
  // มีคนเดียวก็ไม่ต้องแปะรูปโปรไฟล์ให้รก — แปะเมื่อดูรวมแล้วมีหลายคนเท่านั้น
  const siteOwners = new Set((data?.bySite ?? []).flatMap((bucket) => bucket.owners.map((o) => o.id))).size;
  const showOwners = !viewOwner && siteOwners > 1;

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="สรุปยอด"
        subtitle={
          data
            ? `${data.label} · ${data.totals.count} รายการ${viewOwner ? ` · ของ ${viewOwner.name}` : ""}`
            : "—"
        }
      />

      <OwnerPicker />

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

          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {BREAKDOWNS.filter(
              (item) =>
                (item.value !== "month" || data.byMonth.length > 1) &&
                (item.value !== "day" || data.byDay.length > 1),
            ).map((item) => (
              <Chip
                key={item.value}
                active={breakdown === item.value}
                onClick={() => setBreakdown(item.value)}
              >
                {item.label}
              </Chip>
            ))}
          </div>

          <section className="card p-4">
            <SectionTitle>
              {BREAKDOWNS.find((item) => item.value === breakdown)?.label ?? ""}
            </SectionTitle>

            {rows.length === 0 ? (
              <EmptyState>ยังไม่มีรายการในช่วงนี้</EmptyState>
            ) : (
              <>
                {breakdown === "bank" ? (
                  <BankGroups
                    buckets={rows as BankBucket[]}
                    max={maxBank}
                    showOwner={bankOwners > 1}
                  />
                ) : (
                  <div>
                    {(rows as Array<SummaryBucket & { siteId?: string; color?: string | null; owners?: OwnerRef[] }>).map(
                      (bucket) => (
                        <SummaryRow
                          key={bucket.key}
                          bucket={bucket}
                          max={breakdown === "site" ? maxSite : breakdown === "day" ? maxDay : maxMonth}
                          emoji={bucket.siteId ? siteEmoji[bucket.siteId] : null}
                          owners={showOwners ? bucket.owners : undefined}
                        />
                      ),
                    )}
                  </div>
                )}

                {hiddenCount > 0 ? (
                  <button type="button" className="link-sm mt-2.5" onClick={() => setShowAll(true)}>
                    ดูทั้งหมด (อีก {hiddenCount} รายการ)
                  </button>
                ) : null}

                {breakdown === "bank" ? (
                  <p className="dim mt-2.5 text-[11px]">
                    แถบชมพู = โอนออกจากบัญชีนี้เข้าเว็บ · แถบเขียวมินต์ = ถอนจากเว็บเข้าบัญชีนี้
                  </p>
                ) : null}
              </>
            )}
          </section>

          <p className="dim text-center text-[11px]">
            แถบชมพู = เงินเข้าเว็บ · แถบเขียวมินต์ = เงินออกจากเว็บ · ตัวเลขขวา = กำไร/ขาดทุน
          </p>
        </>
      ) : null}
    </div>
  );
}
