import { APP_TIMEZONE } from "./env";
import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase";
import { formatDateKey, formatThaiDate, formatThaiMonth } from "./thai-date";
import type { SummaryBucket, SummaryResponse, TransactionWithSite } from "./types";

export const TRANSACTION_SELECT =
  "id, owner_id, site_id, direction, amount, occurred_at, occurred_date, ref_no, bank_name, counterparty, note, image_path, image_hash, ocr_status, ocr_confidence, created_at, site:sites(id, name, color), owner:app_users(display_name)";

interface FetchParams {
  ownerId: string;
  /** true = ดูข้ามทุกบัญชี (ต้องมีสิทธิ์ can_view_all) — ต้องระบุชัดเจนเท่านั้น */
  includeAllOwners?: boolean;
  from: Date;
  to: Date;
  siteId?: string | null;
  direction?: string | null;
  limit?: number;
}

/** ดึงรายการในช่วงเวลา (from ≤ x < to) — ปกติเฉพาะของเจ้าของ เว้นแต่ระบุ includeAllOwners */
export async function fetchTransactions(params: FetchParams): Promise<TransactionWithSite[]> {
  let query = supabaseAdmin()
    .from("transactions")
    .select(TRANSACTION_SELECT)
    .gte("occurred_at", params.from.toISOString())
    .lt("occurred_at", params.to.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(params.limit ?? 2000);

  if (!params.includeAllOwners) query = query.eq("owner_id", params.ownerId);
  if (params.siteId) query = query.eq("site_id", params.siteId);
  if (params.direction) query = query.eq("direction", params.direction);

  const { data, error } = await query;
  if (error) throw new HttpError(500, `ดึงข้อมูลไม่สำเร็จ: ${error.message}`);

  // supabase-js คืน relation แบบ array เมื่อ infer type ไม่ได้ — ปรับให้เป็น object เดียว
  return (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const site = record.site;
    const owner = record.owner;
    return {
      ...(record as unknown as TransactionWithSite),
      amount: Number(record.amount),
      site: Array.isArray(site) ? ((site[0] ?? null) as TransactionWithSite["site"]) : (site as TransactionWithSite["site"]),
      owner: Array.isArray(owner) ? ((owner[0] ?? null) as TransactionWithSite["owner"]) : (owner as TransactionWithSite["owner"]),
    };
  });
}

function emptyBucket(key: string, label: string): SummaryBucket {
  return { key, label, deposit: 0, withdraw: 0, net: 0, count: 0 };
}

function add(bucket: SummaryBucket, direction: string, amount: number) {
  if (direction === "deposit") bucket.deposit += amount;
  else bucket.withdraw += amount;
  bucket.net = bucket.withdraw - bucket.deposit;
  bucket.count += 1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function tidy(bucket: SummaryBucket): SummaryBucket {
  return {
    ...bucket,
    deposit: round2(bucket.deposit),
    withdraw: round2(bucket.withdraw),
    net: round2(bucket.net),
  };
}

/**
 * รวมยอดจากรายการดิบ
 * net = เงินออกจากเว็บ − เงินเข้าเว็บ (บวก = ได้กำไร)
 */
export function buildSummary(
  rows: TransactionWithSite[],
  range: { from: Date; to: Date },
  timeZone: string = APP_TIMEZONE,
): SummaryResponse {
  const byDay = new Map<string, SummaryBucket>();
  const byMonth = new Map<string, SummaryBucket>();
  const bySite = new Map<string, SummaryBucket & { siteId: string; color: string | null }>();
  const totals = { deposit: 0, withdraw: 0, net: 0, count: 0 };

  for (const row of rows) {
    const amount = Number(row.amount) || 0;
    const dayKey = formatDateKey(new Date(row.occurred_at), timeZone);
    const monthKey = dayKey.slice(0, 7);

    if (!byDay.has(dayKey)) byDay.set(dayKey, emptyBucket(dayKey, formatThaiDate(row.occurred_at, timeZone)));
    add(byDay.get(dayKey)!, row.direction, amount);

    if (!byMonth.has(monthKey)) byMonth.set(monthKey, emptyBucket(monthKey, formatThaiMonth(monthKey)));
    add(byMonth.get(monthKey)!, row.direction, amount);

    const siteId = row.site_id;
    if (!bySite.has(siteId)) {
      bySite.set(siteId, {
        ...emptyBucket(siteId, row.site?.name ?? "(ไม่พบเว็บ)"),
        siteId,
        color: row.site?.color ?? null,
      });
    }
    add(bySite.get(siteId)!, row.direction, amount);

    if (row.direction === "deposit") totals.deposit += amount;
    else totals.withdraw += amount;
    totals.count += 1;
  }

  totals.net = totals.withdraw - totals.deposit;

  return {
    from: formatDateKey(range.from, timeZone),
    to: formatDateKey(new Date(range.to.getTime() - 1), timeZone),
    totals: {
      deposit: round2(totals.deposit),
      withdraw: round2(totals.withdraw),
      net: round2(totals.net),
      count: totals.count,
    },
    byDay: [...byDay.values()].map(tidy).sort((a, b) => a.key.localeCompare(b.key)),
    byMonth: [...byMonth.values()].map(tidy).sort((a, b) => a.key.localeCompare(b.key)),
    bySite: [...bySite.values()]
      .map((bucket) => ({ ...tidy(bucket), siteId: bucket.siteId, color: bucket.color }))
      .sort((a, b) => b.deposit + b.withdraw - (a.deposit + a.withdraw)),
  };
}

export async function getSummary(params: FetchParams): Promise<SummaryResponse> {
  const rows = await fetchTransactions(params);
  return buildSummary(rows, { from: params.from, to: params.to });
}
