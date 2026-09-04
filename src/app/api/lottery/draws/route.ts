/**
 * กรอกผลหวยรายวัน แล้วเด้งการ์ดเข้า LINE
 *
 * GET  — สถานะของวันนั้น: หวยไหนกรอกแล้ว/ยังไม่กรอก · ผลรายตำแหน่ง · รวมวันนี้
 * POST — บันทึกผลของหวยหนึ่งตัว แล้วส่งการ์ด (ผู้ดูแลเท่านั้น)
 *
 * ⚠️⚠️ **เขียนแบบเติมช่องว่างเท่านั้น** (`sequence-merge.ts`) — ตาราง `lottery_datasets`
 * มีคนเขียน 2 ทาง: หน้านี้ กับ `sync_to_supabase.py` ฝั่ง Streamlit ที่ส่ง sequence
 * เต็มปีมา upsert · ถ้าทางไหนทับได้ ผลที่อีกทางเพิ่งกรอกจะหายโดยไม่มีใครรู้
 * ค่าเดิมไม่ตรงกับที่กรอก = **409 ไม่เขียนทั้งก้อน** ไม่ใช่เลือกข้างเงียบ ๆ
 *
 * ⚠️ กรอก "สามบน" แล้ว "สองบน" เติมให้เอง — 2 หลักท้ายของสามบน = สองบน เป๊ะทุกงวด
 * (ยืนยันกับข้อมูลจริง 161,430/161,430 งวด) · กรอกมาทั้งคู่แล้วไม่ตรง = ปฏิเสธ
 */

import { requireAdmin, requireLotteryViewer } from "@/lib/auth";
import { appUrl, env } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { readJsonBody } from "@/lib/ingest-auth";
import { isMessagingConfigured, pushMessageResult } from "@/lib/line";
import { readSequencesForLotteries } from "@/lib/lottery/dataset-read";
import {
  computeDay,
  monthTable,
  prepareReplay,
  yearBeOf,
  type DayReport,
} from "@/lib/lottery/day-result";
import { buildDrawCard } from "@/lib/lottery/line-card";
import {
  computeSnapshot,
  requiredSequenceKeys,
  yearBeToCe,
  type DatasetSequence,
} from "@/lib/lottery/portfolio-engine";
import type { LotteryPortfolio, PortfolioConfig } from "@/lib/lottery/portfolio-config";
import { dayIndexOf, mergeCell } from "@/lib/lottery/sequence-merge";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PORTFOLIO_TABLE = "lottery_portfolios";
const DATASET_TABLE = "lottery_datasets";
const MAX_BODY_BYTES = 64 * 1024;

interface PortfolioRow {
  id: number;
  name: string;
  source: string | null;
  capital: number;
  config: PortfolioConfig;
  is_active: boolean;
}

/** วันที่แบบ YYYY-MM-DD → Date (UTC เที่ยงคืน) — ทุกที่ในระบบคิดวันแบบ UTC ล้วน */
function parseDate(value: string | null): Date {
  const text = (value ?? "").trim();
  if (!text) {
    // "วันนี้" ของเจ้าของ = เวลาไทย ไม่ใช่ UTC ของเซิร์ฟเวอร์ (ต่างกัน 7 ชม.
    // ⇒ ก่อนเที่ยงคืนไทยเซิร์ฟเวอร์ยังเป็นเมื่อวาน ถ้าไม่ชดเชยจะกรอกลงผิดวัน)
    const now = new Date(Date.now() + 7 * 3_600_000);
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) throw new HttpError(400, "วันที่ต้องเป็นรูปแบบ YYYY-MM-DD", "bad_date");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) throw new HttpError(400, "วันที่ไม่ถูกต้อง", "bad_date");
  return date;
}

async function loadPortfolios(): Promise<PortfolioRow[]> {
  const { data, error } = await supabaseAdmin()
    .from(PORTFOLIO_TABLE)
    .select("id, name, source, capital, config, is_active")
    .order("is_active", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new HttpError(500, `อ่านพอร์ตไม่สำเร็จ: ${error.message}`);
  return (data ?? []) as unknown as PortfolioRow[];
}

function pickPortfolio(rows: PortfolioRow[], wanted: number | null): PortfolioRow {
  if (rows.length === 0) throw new HttpError(404, "ยังไม่มีพอร์ตในระบบ", "not_found");
  if (wanted === null) return rows[0];
  const found = rows.find((row) => row.id === wanted);
  if (!found) throw new HttpError(404, `ไม่มีพอร์ตเลข ${wanted}`, "not_found");
  return found;
}

function toPortfolio(row: PortfolioRow): LotteryPortfolio {
  return { id: row.id, name: row.name, source: row.source, capital: row.capital, config: row.config };
}

/** sequence ทุกอันที่พอร์ตต้องใช้ (คีย์ที่หาไม่เจอ = ขานั้นคำนวณไม่ได้ engine เตือนเอง) */
async function loadSequences(portfolio: LotteryPortfolio): Promise<DatasetSequence[]> {
  const keys = requiredSequenceKeys(portfolio);
  const rows = await readSequencesForLotteries(keys.map((k) => k.lottery));
  return rows.map((row) => ({
    lottery: row.lottery,
    position: row.position,
    year: row.year,
    digits: Number(row.digits ?? 2),
    sequence: row.sequence ?? "",
    isDateSorted: row.is_date_sorted ?? true,
  }));
}

function summarise(report: DayReport) {
  return {
    date: report.date.toISOString().slice(0, 10),
    yearBe: report.yearBe,
    portfolioId: report.portfolioId,
    portfolioName: report.portfolioName,
    pnl: report.pnl,
    cost: report.cost,
    doneCount: report.doneCount,
    totalCount: report.totalCount,
    warnings: report.warnings,
    lotteries: report.lotteries.map((group) => ({
      lottery: group.lottery,
      flag: group.flag,
      time: group.time,
      pnl: group.pnl,
      cost: group.cost,
      complete: group.complete,
      untouched: group.untouched,
      legs: group.legs.map((leg) => ({
        position: leg.position,
        digits: leg.digits,
        status: leg.status,
        draw: leg.draw,
        nBet: leg.nBet,
        betPerNumber: leg.betPerNumber,
        payoutRate: leg.payoutRate,
        cost: leg.cost,
        pnl: leg.pnl,
      })),
    })),
  };
}

export const GET = route(async (request) => {
  await requireLotteryViewer(request);

  const query = new URL(request.url).searchParams;
  const date = parseDate(query.get("date"));
  const rows = await loadPortfolios();
  const wanted = query.get("portfolioId");
  const row = pickPortfolio(rows, wanted ? Number.parseInt(wanted, 10) : null);
  const portfolio = toPortfolio(row);
  const sequences = await loadSequences(portfolio);
  const report = computeDay({ portfolio, sequences, date });

  return ok({
    portfolios: rows.map((p) => ({ id: p.id, name: p.name, isActive: p.is_active })),
    day: summarise(report),
    lineReady: isMessagingConfigured() && Boolean(env("LINE_REPORT_TO")),
  });
});

/* ─────────────────────────── บันทึกผล ─────────────────────────── */

interface SavePayload {
  portfolioId?: number;
  date?: string;
  lottery?: string;
  draws?: Record<string, string>;
  send?: boolean;
  /** true = ยอมทับผลเดิมของวันนั้น (คนกดสั่งแก้เอง) — ดีฟอลต์คือห้ามทับ */
  overwrite?: boolean;
}

export const POST = route(async (request) => {
  await requireAdmin(request);

  const body = (await readJsonBody(request, MAX_BODY_BYTES)) as SavePayload;
  const date = parseDate(body.date ?? null);
  const lottery = String(body.lottery ?? "").trim();
  if (!lottery) throw new HttpError(400, "ต้องบอกว่ากรอกผลของหวยตัวไหน", "bad_payload");

  const rows = await loadPortfolios();
  const row = pickPortfolio(rows, body.portfolioId ?? null);
  const portfolio = toPortfolio(row);
  const yearBe = yearBeOf(date);

  const legs = (portfolio.config.legs ?? []).filter(
    (leg) => leg.lottery === lottery && String(leg.test_year) === yearBe,
  );
  if (legs.length === 0) {
    throw new HttpError(400, `พอร์ตนี้ไม่มีขาของ ${lottery} ปี 25${yearBe}`, "not_in_portfolio");
  }

  /* ── เลขที่กรอกมา + เติมสองบนจากสามบนให้เอง ── */
  const given: Record<string, string> = {};
  for (const [position, value] of Object.entries(body.draws ?? {})) {
    const clean = String(value ?? "").trim();
    if (clean) given[position] = clean;
  }
  const three = legs.find((leg) => Number(leg.digits ?? 2) === 3);
  const twoTop = legs.find((leg) => leg.position === "สองบน");
  if (three && twoTop && given[three.position]) {
    const derived = given[three.position].slice(-2);
    if (given["สองบน"] && given["สองบน"] !== derived) {
      throw new HttpError(
        400,
        `สองบน (${given["สองบน"]}) ไม่ตรงกับ 2 หลักท้ายของสามบน (${given[three.position]}) — พิมพ์ผิดตัวใดตัวหนึ่ง`,
        "mismatch",
      );
    }
    given["สองบน"] = derived;
  }
  if (Object.keys(given).length === 0) throw new HttpError(400, "ยังไม่ได้กรอกเลขสักตำแหน่ง", "bad_payload");

  /* ── เขียนลง lottery_datasets แบบเติมช่องว่าง ── */
  const supabase = supabaseAdmin();
  const existing = await readSequencesForLotteries([lottery]);
  const ceYear = yearBeToCe(yearBe);
  const index = dayIndexOf(date, ceYear);
  const now = new Date().toISOString();

  const writes: Record<string, unknown>[] = [];
  const conflicts: string[] = [];
  const saved: string[] = [];
  const already: string[] = [];

  for (const leg of legs) {
    const value = given[leg.position];
    if (!value) continue;
    const digits = Number(leg.digits ?? 2);
    if (value.length !== digits || !/^\d+$/.test(value)) {
      throw new HttpError(400, `${leg.position} ต้องเป็นตัวเลข ${digits} หลัก (ได้ "${value}")`, "bad_payload");
    }
    const found = existing.find(
      (r) => r.position === leg.position && r.year === yearBe && Number(r.digits ?? 2) === digits,
    );
    const merged = mergeCell(found?.sequence ?? "", index, value, digits, body.overwrite === true);
    if (merged.conflict) {
      conflicts.push(
        `${leg.position}: มีผลอยู่แล้วเป็น ${merged.conflict.existing} แต่กรอกมา ${merged.conflict.incoming}`,
      );
      continue;
    }
    if (merged.alreadySame) {
      already.push(leg.position);
      continue;
    }
    if (!merged.changed) continue;
    writes.push({
      lottery,
      position: leg.position,
      year: yearBe,
      flag: found?.flag ?? leg.flag ?? "🎰",
      digits,
      sequence: merged.sequence,
      // 3 ตัวเป็น calendar-indexed เสมอ · 2 ตัวที่กรอกตามวันก็ต้องเป็นแบบเดียวกัน
      is_date_sorted: found?.is_date_sorted ?? true,
      updated_at: now,
    });
    saved.push(leg.position);
  }

  if (conflicts.length > 0) {
    // ⚠️ บล็อกทั้งก้อน ไม่เขียนบางตำแหน่ง — ครึ่ง ๆ กลาง ๆ แก้ยากกว่าไม่เขียนเลย
    throw new HttpError(
      409,
      `ผลของวันนี้ถูกกรอกไว้แล้วและไม่ตรงกัน — ${conflicts.join(" · ")}`,
      "conflict",
    );
  }

  if (writes.length > 0) {
    const { error } = await supabase
      .from(DATASET_TABLE)
      .upsert(writes, { onConflict: "lottery,position,year" });
    if (error) throw new HttpError(500, `บันทึกผลหวยไม่สำเร็จ: ${error.message}`);
  }

  /* ── คำนวณใหม่ทั้งพอร์ตแล้วประกอบการ์ด ── */
  const sequences = await loadSequences(portfolio);
  const replay = prepareReplay(portfolio, sequences);
  const report = computeDay({ portfolio, replay, date });
  const table = monthTable({ portfolio, replay, lottery, date });

  let snapshot = null;
  try {
    snapshot = computeSnapshot({ portfolio, sequences });
  } catch {
    // คำนวณพอร์ตทั้งก้อนไม่ได้ (เช่นบางขายังไม่มีผลหวย) = ยังส่งการ์ดผลรายวันได้
    snapshot = null;
  }

  let line: { sent: boolean; reason: string | null } = { sent: false, reason: "ไม่ได้สั่งให้ส่ง" };
  if (body.send !== false) {
    const to = env("LINE_REPORT_TO");
    if (!isMessagingConfigured() || !to) {
      line = { sent: false, reason: "ยังไม่ได้ตั้ง LINE_REPORT_TO / LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" };
    } else {
      const messages = buildDrawCard({
        report,
        lottery,
        month: table,
        snapshot,
        appUrl: appUrl(),
        // ส่งการ์ดซ้ำเพราะแก้ผลที่กรอกผิด ⇒ หัวการ์ดต้องประกาศตัวเอง (LINE ถอนคืนไม่ได้)
        corrected: body.overwrite === true,
      });
      // ผลหวยบันทึกลงฐานข้อมูลไปแล้ว — ส่งไม่ผ่านห้ามทำให้ทั้งคำขอล้ม แต่ต้องบอกตรง ๆ
      // (2 ก้อน: carousel + ตารางรายเดือน — LINE รับได้ 5 ก้อนต่อ push)
      const result = await pushMessageResult(to, messages);
      line = { sent: result.ok, reason: result.error };
    }
  }

  return ok({ saved, already, day: summarise(report), line });
});
