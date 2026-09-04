/**
 * ผลของ **วันเดียว** ต่อขา/ต่อหวย — ตัวเลขที่การ์ด LINE กับหน้ากรอกผลใช้ร่วมกัน
 *
 * ⚠️⚠️ **ห้ามคำนวณ pnl เองซ้ำ** — ทุกอย่างเดินผ่าน `replayPortfolio()` ตัวเดียวกับที่
 * หน้าพอร์ตใช้วาดกราฟ แล้วค่อยหยิบ "วันที่ต้องการ" ออกมา ⇒ เลขในการ์ดกับเลขบนเว็บ
 * ตรงกันเสมอโดยไม่ต้องไล่เทียบ · ถ้าเขียนสูตร prize−cost ซ้ำที่นี่ วันหนึ่งมันจะเพี้ยน
 * คนละทางกับกราฟแล้วไม่มีใครจับได้
 *
 * ⚠️⚠️ index ของวัน = **วันปฏิทินนับจาก 1 ม.ค.** ของ `test_year` ของขานั้น
 * (วันหยุดก็กินหนึ่งช่อง) ไม่ใช่ "งวดที่"
 */

import type { LotteryPortfolio, PortfolioConfig, PortfolioLegConfig } from "./portfolio-config";
import {
  legBetAt,
  replayPortfolio,
  yearBeToCe,
  type DatasetSequence,
  type LegDetail,
  type ReplayResult,
} from "./portfolio-engine";
import { isSkip } from "./engine";
import { dayIndexOf } from "./sequence-merge";

/** สถานะของขาในวันนั้น — แยก "ยังไม่มีผล" ออกจาก "ไม่ถูก" ให้ชัด */
export type DayLegStatus = "hit" | "miss" | "no-bet" | "holiday" | "pending";

export interface DayLegResult {
  legIndex: number;
  lottery: string;
  position: string;
  flag: string;
  digits: number;
  status: DayLegStatus;
  /** เลขที่ออกของวันนั้น — null เมื่อยังไม่มีผล */
  draw: string | null;
  nBet: number;
  betPerNumber: number;
  payoutRate: number;
  cost: number;
  pnl: number;
}

export interface DayLotteryResult {
  lottery: string;
  flag: string;
  /** เวลาออกผลจาก `schedule.lottery_times` — null = ไม่เคยตั้ง */
  time: string | null;
  legs: DayLegResult[];
  cost: number;
  pnl: number;
  /** true = ทุกตำแหน่งของหวยนี้มีผลแล้ว */
  complete: boolean;
  /** true = ยังไม่มีผลสักตำแหน่ง */
  untouched: boolean;
}

export interface DayReport {
  /** วันที่ (UTC ล้วน) */
  date: Date;
  yearBe: string;
  portfolioId: number;
  portfolioName: string;
  lotteries: DayLotteryResult[];
  /** รวมเฉพาะหวยที่มีผลแล้ว */
  pnl: number;
  cost: number;
  doneCount: number;
  totalCount: number;
  warnings: string[];
}

/** {ชื่อหวย: "HH:MM"} — `portfolio_report.schedule_times` ฝั่ง Python */
export function scheduleTimes(portfolio: { config: PortfolioConfig }): Record<string, string> {
  const raw = portfolio.config.schedule?.lottery_times;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const text = String(value ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(text)) out[name] = text.padStart(5, "0");
  }
  return out;
}

/** "17:30" → 1050 · ไม่มีเวลา = ไปท้ายสุด (คงลำดับในพอร์ตไว้) */
export function minutesOf(time: string | null | undefined): number {
  if (!time) return 24 * 60 + 1;
  const [h, m] = time.split(":").map((v) => Number.parseInt(v, 10));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return 24 * 60 + 1;
  return h * 60 + m;
}

/**
 * ลำดับตำแหน่งภายในหวยเดียวกัน: **สามบน → สองบน → สองล่าง**
 *
 * ⚠️ อย่าใช้ `localeCompare` แทน — มันบังเอิญให้ลำดับนี้กับสามชื่อที่มีอยู่ตอนนี้
 * แต่ตำแหน่งชื่ออื่นที่เพิ่มมาทีหลังจะไปแทรกกลางแบบเดาไม่ได้
 */
const POSITION_ORDER = ["สามบน", "สองบน", "สองล่าง"];

export function positionRank(position: string): number {
  const i = POSITION_ORDER.indexOf(position.trim());
  return i === -1 ? POSITION_ORDER.length : i;
}

/** เรียงขาในหวยเดียวกัน — หลักมากก่อน แล้วตามลำดับตำแหน่งข้างบน */
export function comparePositions(
  a: { digits: number; position: string },
  b: { digits: number; position: string },
): number {
  return (
    b.digits - a.digits ||
    positionRank(a.position) - positionRank(b.position) ||
    a.position.localeCompare(b.position, "th")
  );
}

/** ปี พ.ศ. 2 หลักของวันที่ (UTC) */
export function yearBeOf(date: Date): string {
  return String((date.getUTCFullYear() + 543) % 100).padStart(2, "0");
}

/** ผลของขาหนึ่งในวัน `step` — อ่านจาก detail ที่ replay สร้างไว้แล้ว */
function legOn(detail: LegDetail, step: number): {
  status: DayLegStatus;
  draw: string | null;
  nBet: number;
  cost: number;
  pnl: number;
} {
  if (step < 0 || step >= detail.testList.length) {
    return { status: "pending", draw: null, nBet: 0, cost: 0, pnl: 0 };
  }
  const draw = detail.testList[step];
  if (isSkip(draw, detail.digits)) {
    // "--" = ยังไม่ได้กรอก · "xx" = วันหยุด (คนละเรื่องกัน ต้องบอกให้ต่างกัน)
    const pending = /^-+$/.test(draw);
    return { status: pending ? "pending" : "holiday", draw: null, nBet: 0, cost: 0, pnl: 0 };
  }
  const [nums, nBet] = legBetAt(detail, step);
  if (nBet === 0) return { status: "no-bet", draw, nBet: 0, cost: 0, pnl: 0 };
  const hit = nums.has(draw);
  const cost = nBet * detail.betPerNumber;
  const prize = hit ? detail.betPerNumber * detail.payoutRate : 0;
  return { status: hit ? "hit" : "miss", draw, nBet, cost, pnl: prize - cost };
}

/**
 * รัน replay ครั้งเดียวแล้วเอาไปใช้ซ้ำ — ตัวเดียวกับที่ `computeSnapshot` ใช้
 * (การ์ดหนึ่งชุดต้องใช้ทั้งผลรายวันและตารางรายเดือน ⇒ replay ซ้ำ 2 รอบเปลืองเปล่า)
 */
export function prepareReplay(
  portfolio: LotteryPortfolio,
  sequences: readonly DatasetSequence[],
): ReplayResult {
  return replayPortfolio(portfolio.config.legs ?? [], portfolio.capital, sequences);
}

export function computeDay(input: {
  portfolio: LotteryPortfolio;
  sequences?: readonly DatasetSequence[];
  /** ส่งมาแล้วจะไม่ replay ซ้ำ */
  replay?: ReplayResult;
  date: Date;
}): DayReport {
  const { portfolio, sequences, date } = input;
  const legs = portfolio.config.legs ?? [];
  const replay = input.replay ?? prepareReplay(portfolio, sequences ?? []);
  const times = scheduleTimes(portfolio);
  const yearBe = yearBeOf(date);

  const groups = new Map<string, DayLotteryResult>();
  const order: string[] = [];

  replay.details.forEach((detail, i) => {
    const legIndex = replay.configs[i]?.legIndex;
    if (legIndex === undefined) return;
    const leg: PortfolioLegConfig | undefined = legs[legIndex];
    if (!leg) return;
    // ขาที่เทสคนละปีกับวันที่ขอ = วันนี้มันไม่ได้เล่น ⇒ ไม่ต้องมีในรายงาน
    if (String(leg.test_year) !== yearBe) return;

    let step: number;
    try {
      step = dayIndexOf(date, yearBeToCe(leg.test_year));
    } catch {
      return;
    }
    const on = legOn(detail, step);
    const row: DayLegResult = {
      legIndex,
      lottery: leg.lottery,
      position: leg.position,
      flag: leg.flag ?? "🎰",
      digits: detail.digits,
      status: on.status,
      draw: on.draw,
      nBet: on.nBet,
      betPerNumber: detail.betPerNumber,
      payoutRate: detail.payoutRate,
      cost: on.cost,
      pnl: on.pnl,
    };

    let group = groups.get(leg.lottery);
    if (!group) {
      group = {
        lottery: leg.lottery,
        flag: row.flag,
        time: times[leg.lottery] ?? null,
        legs: [],
        cost: 0,
        pnl: 0,
        complete: false,
        untouched: true,
      };
      groups.set(leg.lottery, group);
      order.push(leg.lottery);
    }
    group.legs.push(row);
    group.cost += row.cost;
    group.pnl += row.pnl;
  });

  const lotteries = [...groups.values()];
  for (const group of lotteries) {
    // สามบน → สองบน → สองล่าง (ลำดับเดียวกับรายงานเดิมฝั่ง Python)
    group.legs.sort(comparePositions);
    group.complete = group.legs.every((l) => l.status !== "pending");
    group.untouched = group.legs.every((l) => l.status === "pending");
  }
  lotteries.sort(
    (a, b) => minutesOf(a.time) - minutesOf(b.time) || order.indexOf(a.lottery) - order.indexOf(b.lottery),
  );

  const done = lotteries.filter((l) => !l.untouched);
  return {
    date,
    yearBe,
    portfolioId: portfolio.id,
    portfolioName: portfolio.name,
    lotteries,
    pnl: done.reduce((s, l) => s + l.pnl, 0),
    cost: done.reduce((s, l) => s + l.cost, 0),
    doneCount: done.length,
    totalCount: lotteries.length,
    warnings: replay.warnings,
  };
}

/* ─────────────────────── ตารางรายวันของเดือน (หวยเดียว) ─────────────────────── */

export interface MonthCell {
  day: number;
  draw: string | null;
  status: DayLegStatus;
  cost: number;
  pnl: number;
}

export interface MonthColumn {
  position: string;
  digits: number;
  cells: MonthCell[];
  hits: number;
  misses: number;
  cost: number;
  pnl: number;
}

export interface MonthTable {
  lottery: string;
  flag: string;
  /** เวลาออกผลจาก schedule — null = ไม่เคยตั้ง */
  time: string | null;
  /** เลขเดือน 1-12 */
  month: number;
  yearBe: string;
  /** วันที่ที่มีผลจริงอย่างน้อยหนึ่งตำแหน่ง */
  days: number[];
  columns: MonthColumn[];
  pnl: number;
  cost: number;
}

/**
 * ผลรายวันของ **หวยเดียว** ตลอดเดือนของ `date` — คอลัมน์ = ตำแหน่งของหวยนั้น
 *
 * ใช้ replay ตัวเดียวกับ `computeDay` ⇒ ช่องที่ทำเครื่องหมาย "ถูก" ในตาราง
 * คือช่องเดียวกับที่กราฟนับเป็นกำไรวันนั้นเป๊ะ
 */
export function monthTable(input: {
  portfolio: LotteryPortfolio;
  sequences?: readonly DatasetSequence[];
  replay?: ReplayResult;
  lottery: string;
  date: Date;
}): MonthTable | null {
  const { portfolio, sequences, lottery, date } = input;
  const legs = portfolio.config.legs ?? [];
  const replay = input.replay ?? prepareReplay(portfolio, sequences ?? []);
  const yearBe = yearBeOf(date);
  const month = date.getUTCMonth() + 1;
  const times = scheduleTimes(portfolio);

  const columns: MonthColumn[] = [];
  let flag = "🎰";
  let ceYear: number | null = null;

  replay.details.forEach((detail, i) => {
    const legIndex = replay.configs[i]?.legIndex;
    if (legIndex === undefined) return;
    const leg = legs[legIndex];
    if (!leg || leg.lottery !== lottery || String(leg.test_year) !== yearBe) return;
    flag = leg.flag ?? flag;
    try {
      ceYear = yearBeToCe(leg.test_year);
    } catch {
      return;
    }

    const cells: MonthCell[] = [];
    let hits = 0;
    let misses = 0;
    let pnl = 0;
    let cost = 0;
    const lastDay = new Date(Date.UTC(ceYear, month, 0)).getUTCDate();
    for (let day = 1; day <= lastDay; day += 1) {
      const step = dayIndexOf(new Date(Date.UTC(ceYear, month - 1, day)), ceYear);
      const on = legOn(detail, step);
      if (on.status === "hit") hits += 1;
      if (on.status === "miss") misses += 1;
      pnl += on.pnl;
      cost += on.cost;
      cells.push({ day, draw: on.draw, status: on.status, cost: on.cost, pnl: on.pnl });
    }
    columns.push({ position: leg.position, digits: detail.digits, cells, hits, misses, cost, pnl });
  });

  if (columns.length === 0 || ceYear === null) return null;
  columns.sort(comparePositions);

  const lastDay = new Date(Date.UTC(ceYear, month, 0)).getUTCDate();
  const days: number[] = [];
  for (let day = 1; day <= lastDay; day += 1) {
    // เอาเฉพาะวันที่มีผลจริง — วันหยุด/ยังไม่ถึง ไม่ต้องกินแถวเปล่า
    if (columns.some((c) => c.cells[day - 1].status === "hit" || c.cells[day - 1].status === "miss")) {
      days.push(day);
    }
  }

  return {
    lottery,
    flag,
    time: times[lottery] ?? null,
    month,
    yearBe,
    days,
    columns,
    pnl: columns.reduce((s, c) => s + c.pnl, 0),
    cost: columns.reduce((s, c) => s + c.cost, 0),
  };
}
