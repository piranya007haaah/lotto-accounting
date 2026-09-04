/**
 * engine พอร์ต — พอร์ตมาจาก `replay_portfolio` / `run_portfolio` ของ `src/backtest.py`
 * (รีโป lottery-app) เพื่อให้ **แก้พอร์ตแล้วเห็นผลใหม่ทันทีในแอปนี้** โดยไม่ต้องพึ่ง Python
 *
 * ── สัญญาระหว่างช่วงงาน (ห้ามแก้ชื่อ/รูปแบบโดยไม่บอกอีกฝั่ง) ─────────────────
 * `computeSnapshot()` ต้องคืน **`PortfolioSnapshot` รูปเดียวกับที่ Python ส่งมาเป๊ะ**
 * (`src/lib/types.ts`) ⇒ หน้าจอ/กราฟที่มีอยู่แล้ววาดต่อได้ทันที และเทียบกับของจริง
 * ที่ฝั่งโน้นคำนวณได้ตรง ๆ ว่าตรงกันไหม
 *
 * ── กติกาที่พลาดแล้วเงียบ (ยกมาจาก CLAUDE.md ทั้งสองรีโป) ──────────────────
 * 1. ⚠️⚠️ index ของ sequence = **วันปฏิทินนับจาก 1 ม.ค.** ไม่ใช่ "งวดที่" —
 *    วันหยุด (`xx`) และวันที่ยังไม่มีผล (`--`) กินที่ของมันในสตริง
 *    การกรองเดือนต้อง "ปิดวันอื่นเป็น --" ห้ามตัดสตริงให้สั้นลง (วันที่จะเลื่อนทั้งเส้น)
 * 2. ⚠️⚠️ โหมด `rank`/`auto` จัดอันดับ n_bet บน **train เท่านั้น** ห้ามแตะ test
 *    (ใช้ `runAllSizes` โดยส่ง train เป็น test — ดู `src/lib/lottery/rank.ts`)
 * 3. ⚠️ ขาที่ตั้งเลขรายเดือน (`manual_months`): เดือนที่ไม่มีคีย์ = **ไม่แทงเดือนนั้น**
 *    (n=0 · ต้นทุน 0 · กำไร 0) และงวดพวกนั้น **ไม่นับเป็นงวดที่แพ้** ตอนคิด win rate
 * 4. ⚠️ ทุกที่ที่คิดผลรายงวดต้องใช้ "เลขของเดือนนั้น" ไม่ใช่เลขรวมทุกเดือน
 *    (ฝั่ง Python คือ `leg_bet_at(detail, step)` — step = วันปฏิทิน ไม่ใช่งวดที่)
 * 5. ⚠️ `Math.round` ≠ `round()` ของ Python (half-to-even) — ใช้ `pyRound` จาก engine.ts
 *    ทุกจุดที่ฝั่งโน้นปัด ไม่งั้นตัวเลขต่างกันทีละบาทแบบหาไม่เจอ
 *
 * ── พิสูจน์ว่าตรงกับ Python จริง ────────────────────────────────────────────
 *   npx tsx scripts/portfolio-check.ts      # เทียบกับ __fixtures__/portfolio-golden.json
 * เฉลยสร้างที่ฝั่งโน้น: `python3 scripts/export_portfolio_fixture.py --out <path>`
 */

import type { PortfolioLeg, PortfolioMonth, PortfolioSnapshot } from "@/lib/types";
import { computeRiskMetrics, isSkip, pyRound, runAllSizes } from "./engine";
import { FORMULAS } from "./formulas";
import type { LotteryPortfolio, PortfolioLegConfig } from "./portfolio-config";

/** ตรงกับ `SNAPSHOT_VERSION` ของ `src/portfolio_snapshot.py` ฝั่ง lottery-app */
export const SNAPSHOT_VERSION = 1;

/** ผลหวยทั้งปีของกลุ่มหนึ่ง — ตรงกับ 1 แถวของตาราง `lottery_datasets` */
export interface DatasetSequence {
  lottery: string;
  position: string;
  year: string;
  /** 1 งวด = กี่ตัวอักษร (2 = สองบน/สองล่าง · 3 = สามบน) */
  digits: number;
  sequence: string;
  isDateSorted: boolean;
}

export interface ComputeInput {
  portfolio: LotteryPortfolio;
  /** ผลหวยเท่าที่ต้องใช้ — หาได้จาก `requiredSequenceKeys()` */
  sequences: readonly DatasetSequence[];
  /** เวลาที่ใช้เขียนช่อง generatedAt (เผื่อเทสต์อยากล็อกค่า) */
  generatedAt?: Date;
}

export interface SequenceKey {
  lottery: string;
  position: string;
  year: string;
  digits: number;
}

/**
 * ปี/หวย/ตำแหน่ง ที่ต้องโหลดมาก่อนถึงจะคำนวณพอร์ตนี้ได้
 * (test_year ของทุกขา + train_years ของขาที่ใช้สูตร)
 */
export function requiredSequenceKeys(portfolio: LotteryPortfolio): SequenceKey[] {
  const keys = new Map<string, SequenceKey>();
  for (const leg of portfolio.config.legs) {
    const digits = leg.digits ?? 2;
    const years = [leg.test_year, ...(leg.train_years ?? [])];
    for (const year of years) {
      if (!year) continue;
      // ⚠️ ต้องมี digits ในคีย์ด้วย — ขา 2 ตัวกับ 3 ตัวอยู่คนละตารางฝั่ง Python
      // (datasets vs datasets_3d) ถ้า dedupe ทิ้งตัวหนึ่งจะโหลดข้อมูลมาไม่ครบ
      keys.set(`${leg.lottery}|${leg.position}|${year}|${digits}`, {
        lottery: leg.lottery,
        position: leg.position,
        year,
        digits,
      });
    }
  }
  return [...keys.values()];
}

/* ───────────────────────── วันที่ / เดือน (ทุกอย่างเป็น UTC) ─────────────────────────
 * ⚠️ ใช้ `Date.UTC` ล้วน — `new Date(y, m, d)` เป็นเวลาท้องถิ่น พอเจอ DST/เขตเวลา
 * ที่ไม่ใช่ไทย วันจะขยับ 1 วันแบบเงียบ ๆ แล้วชุดเลขรายเดือนเลื่อนทั้งเส้น
 */

const DAY_MS = 86_400_000;

const THAI_MONTHS = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** ป้ายเดือนของกราฟ = `date.strftime("%b")` ของ Python (อังกฤษเสมอ ไม่ตามภาษาเครื่อง) */
const EN_MONTH_ABBR = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** ปี พ.ศ. 2 หลัก → ค.ศ. — เพี้ยนแล้วโยน (ฝั่ง Python ก็ raise ValueError) */
export function yearBeToCe(yearBe: string): number {
  // ⚠️ เข้มเท่า `int()` ของ Python — `parseInt("69abc")` คืน 69 เงียบ ๆ ซึ่งจะทำให้
  // ปีเพี้ยนกลายเป็นวันที่ผิดทั้งสายแทนที่จะฟ้องตั้งแต่ต้น (เคสที่ db.py เตือนไว้)
  const text = String(yearBe ?? "").trim();
  if (!/^[+-]?\d+$/.test(text)) throw new Error(`ปี พ.ศ. ไม่ถูกต้อง: ${JSON.stringify(yearBe)}`);
  return 2500 + Number.parseInt(text, 10) - 543;
}

/** วันที่ของ "วันปฏิทินที่ i นับจาก 1 ม.ค." — i ≥ 365 เลื่อนไปปีถัดไปเหมือน timedelta */
function dayOf(ceYear: number, index: number): Date {
  return new Date(Date.UTC(ceYear, 0, 1 + index));
}

function monthOfDay(ceYear: number, index: number): number {
  return dayOf(ceYear, index).getUTCMonth() + 1;
}

/** จำนวนวันจาก 1 ม.ค. ถึงวันที่ 1 ของเดือนนั้น */
function monthStartIndex(ceYear: number, month: number): number {
  return Math.round((Date.UTC(ceYear, month - 1, 1) - Date.UTC(ceYear, 0, 1)) / DAY_MS);
}

/** "2 ก.ย. 2569" — `portfolio_report.thai_date` */
function thaiDate(d: Date): string {
  return `${d.getUTCDate()} ${THAI_MONTHS[d.getUTCMonth() + 1]} ${d.getUTCFullYear() + 543}`;
}

/* ───────────────────────── ตัดเดือน (db.mask_months) ───────────────────────── */

function isDigits(text: string): boolean {
  if (text.length === 0) return false;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 48 || code > 57) return false;
  }
  return true;
}

/**
 * เก็บเฉพาะวันในเดือน `months` — วันอื่นกลายเป็น `-`.repeat(digits)
 *
 * ⚠️⚠️ **ความยาวเท่าเดิมเสมอ** — ตัดสตริงให้สั้นลงคือบั๊กที่ทั้งระบบจับไม่ได้
 * (index = วันปฏิทิน ⇒ ตัดสั้น = วันที่เลื่อนทั้งเส้น กราฟ/รายงานเพี้ยนเงียบ ๆ)
 */
export function maskMonths(
  sequence: string,
  yearBe: string,
  months: readonly number[] | null | undefined,
  digits = 2,
): string {
  if (months == null) return sequence ?? "";
  const seq = sequence ?? "";
  const want = new Set(months.map((m) => Number(m)));
  const ce = yearBeToCe(yearBe);
  const blank = "-".repeat(digits);
  const full = Math.floor(seq.length / digits);
  const parts: string[] = [];
  for (let i = 0; i < full; i += 1) {
    const chunk = seq.slice(i * digits, (i + 1) * digits);
    parts.push(want.has(monthOfDay(ce, i)) ? chunk : blank);
  }
  // เศษที่ไม่ครบงวด (ข้อมูลเพี้ยน) — Python ต่อท้ายไว้เหมือนเดิม ไม่ทิ้ง
  return parts.join("") + seq.slice(full * digits);
}

/* ─────────────────── train/test string (db.get_train_test_strings) ─────────────────── */

type MonthMap = Record<string, number[]>;

function monthsFor(map: MonthMap | undefined, year: string): number[] | null {
  if (!map) return null;
  // ⚠️ "ไม่มีคีย์" (= ทั้งปี) ต่างจาก "คีย์ที่เป็นลิสต์ว่าง" (= ปิดทั้งปี) — ห้ามใช้ `|| null`
  return Object.prototype.hasOwnProperty.call(map, year) ? map[year] ?? null : null;
}

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export interface SequenceLookup {
  get(lottery: string, position: string, year: string, digits: number): DatasetSequence | undefined;
  /** ปีทั้งหมดของกลุ่มนั้นที่โหลดมา เรียงจากเก่า→ใหม่ */
  years(lottery: string, position: string, digits: number): DatasetSequence[];
}

export function indexSequences(sequences: readonly DatasetSequence[]): SequenceLookup {
  const byKey = new Map<string, DatasetSequence>();
  const byGroup = new Map<string, DatasetSequence[]>();
  for (const row of sequences) {
    const digits = Number(row.digits ?? 2);
    // ขา 3 ตัวฝั่ง Python อ่านจากตาราง datasets_3d ซึ่งมี position เดียว ("สามบน")
    // → จับกลุ่มด้วยหวยอย่างเดียว ไม่งั้นชื่อตำแหน่งที่สะกดต่างกันนิดเดียวก็หาไม่เจอ
    const group = digits === 3 ? `${row.lottery}|3` : `${row.lottery}|${row.position}|2`;
    byKey.set(`${group}|${row.year}`, row);
    const list = byGroup.get(group) ?? [];
    list.push(row);
    byGroup.set(group, list);
  }
  for (const list of byGroup.values()) list.sort((a, b) => (a.year < b.year ? -1 : a.year > b.year ? 1 : 0));
  const groupKey = (lottery: string, position: string, digits: number) =>
    digits === 3 ? `${lottery}|3` : `${lottery}|${position}|2`;
  return {
    get: (lottery, position, year, digits) =>
      byKey.get(`${groupKey(lottery, position, digits)}|${year}`),
    years: (lottery, position, digits) => byGroup.get(groupKey(lottery, position, digits)) ?? [],
  };
}

/**
 * train ทุกปีต่อกันเป็นสตริงเดียว + test ของปีเดียว (พอร์ตมาจาก `db.get_train_test_strings`)
 *
 * โยน Error เมื่อ: ปี test อยู่ใน train แล้ว **เดือนซ้ำกัน** (= เทรนด้วยงวดที่กำลังทดสอบ)
 * หรือปีที่เจาะจงเดือนไม่ได้เรียงตามวันที่ (index → วันที่ตีความไม่ได้ = ตัดเดือนมั่ว)
 */
export function trainTestStrings(options: {
  lookup: SequenceLookup;
  lottery: string;
  position: string;
  digits: number;
  trainYears: readonly string[];
  testYear: string;
  trainMonths?: MonthMap;
  testMonths?: readonly number[];
}): { trainStr: string; testStr: string } {
  const { lookup, lottery, position, digits, trainYears, testYear } = options;
  const testMs = options.testMonths == null
    ? null
    : [...new Set(options.testMonths.map((m) => Number(m)))].sort((a, b) => a - b);

  if (trainYears.some((y) => String(y) === String(testYear))) {
    const trainMsTestYear = monthsFor(options.trainMonths, testYear);
    const a = new Set(trainMsTestYear == null ? ALL_MONTHS : trainMsTestYear.map(Number));
    const b = new Set(testMs == null ? ALL_MONTHS : testMs);
    const overlap = [...a].filter((m) => b.has(m)).sort((x, y) => x - y);
    if (overlap.length > 0) {
      throw new Error(
        `ปี ${testYear} อยู่ทั้งใน train และ test โดยเดือนซ้ำกัน ` +
          `(${overlap.join(", ")}) = เทรนด้วยข้อมูลของงวดที่กำลังทดสอบ`,
      );
    }
  }

  const sliced = (year: string, months: readonly number[] | null): string => {
    const row = lookup.get(lottery, position, year, digits);
    const seq = row?.sequence ?? "";
    if (!seq || months == null) return seq;
    if (!row?.isDateSorted) {
      throw new Error(`ปี ${year} ของ ${lottery} · ${position} ไม่ได้เรียงตามวันที่ → เจาะจงเดือนไม่ได้`);
    }
    return maskMonths(seq, year, months, digits);
  };

  const parts: string[] = [];
  for (const year of trainYears) {
    const s = sliced(year, monthsFor(options.trainMonths, year));
    if (s) parts.push(s);
  }
  return { trainStr: parts.join(""), testStr: sliced(testYear, testMs) };
}

/* ─────────────────── ขา manual ที่เปลี่ยนชุดเลขรายเดือน ─────────────────── */

/** ชุดเลขที่แทงของงวดหนึ่ง (frozenset + จำนวน) — จำนวนนับซ้ำด้วย ต้นทุนจึงตรงกับ Python */
export type BetSet = readonly [Set<string>, number];

const EMPTY_BET: BetSet = [new Set<string>(), 0];

/** `{"7": ["1","02"], 8: []}` → `Map(7 → ["01","02"])` (`backtest.normalize_month_sets`) */
export function normalizeMonthSets(
  raw: Record<string, readonly string[]> | undefined | null,
  digits = 2,
): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const [key, nums] of Object.entries(raw ?? {})) {
    const trimmed = String(key).trim();
    if (!/^[+-]?\d+$/.test(trimmed)) continue;
    const month = Number.parseInt(trimmed, 10);
    if (!(month >= 1 && month <= 12)) continue;
    const clean: string[] = [];
    for (const num of nums ?? []) {
      const s = String(num).trim().padStart(digits, "0");
      if (s.length === digits && isDigits(s) && !clean.includes(s)) clean.push(s);
    }
    if (clean.length > 0) out.set(month, clean);
  }
  return out;
}

/**
 * ชุดเลขของแต่ละ "วันปฏิทิน" 0..nSteps-1 (`backtest.month_step_bets`)
 * เดือนที่ไม่ได้ตั้งเลข = (ว่าง, 0) → ต้นทุน 0 · ไม่มีทางถูก = ไม่แทงเดือนนั้น
 */
export function monthStepBets(
  monthSets: Map<number, string[]>,
  yearBe: string,
  nSteps: number,
  digits = 2,
): BetSet[] {
  const perMonth = new Map<number, BetSet>();
  for (const [month, nums] of monthSets) perMonth.set(month, [new Set(nums), nums.length]);
  const ce = yearBeToCe(yearBe);
  const steps: BetSet[] = [];
  for (let i = 0; i < Math.max(0, Math.trunc(nSteps)); i += 1) {
    steps.push(perMonth.get(monthOfDay(ce, i)) ?? EMPTY_BET);
  }
  return steps;
}

export interface BetPlan {
  sortedNums: string[];
  nBet: number;
  monthSets: Map<number, string[]> | null;
  stepBets: BetSet[] | null;
}

/** `backtest.manual_bet_plan` — รองรับทั้ง "ทั้งปี" และ "แยกรายเดือน" */
export function manualBetPlan(leg: PortfolioLegConfig, testStr: string, digits = 2): BetPlan {
  const monthSets = normalizeMonthSets(leg.manual_months, digits);
  if (monthSets.size === 0) {
    // ⚠️ ไม่ normalize/dedupe — ฝั่ง Python ใช้ `manual_nums` ดิบ ๆ และนับซ้ำเป็นต้นทุนด้วย
    const nums = [...(leg.manual_nums ?? [])];
    return { sortedNums: nums, nBet: nums.length, monthSets: null, stepBets: null };
  }
  const union = [...new Set([...monthSets.values()].flat())].sort();
  const nSteps = Math.floor((testStr ?? "").length / digits);
  return {
    sortedNums: union,
    nBet: Math.max(...[...monthSets.values()].map((v) => v.length)),
    monthSets,
    stepBets: monthStepBets(monthSets, leg.test_year, nSteps, digits),
  };
}

/* ─────────────────────────── run_portfolio ─────────────────────────── */

export interface LegDetail {
  name: string;
  formula: string;
  nBet: number;
  betNumbers: Set<string>;
  betPerNumber: number;
  payoutRate: number;
  testList: string[];
  digits: number;
  stepBets: BetSet[] | null;
  monthSets: Map<number, string[]> | null;
  currentProfit: number;
  maxRealLoss: number;
  profitCurve: number[];
}

/** `backtest.leg_bet_at` — ⚠️ step = **วันปฏิทินจาก 1 ม.ค.** ไม่ใช่ "งวดที่" */
export function legBetAt(detail: LegDetail, step: number): BetSet {
  const steps = detail.stepBets;
  if (steps && steps.length > 0) {
    if (step >= 0 && step < steps.length) return steps[step];
    return EMPTY_BET;
  }
  return [detail.betNumbers, detail.nBet];
}

export interface LegRunConfig {
  /** ขานี้มาจาก `config.legs[legIndex]` — ไว้ผูก detail กลับเข้า leg โดยไม่ต้องแกะชื่อ
   *  (ขาที่รันไม่ได้ถูกข้ามไป ⇒ `details[i]` ไม่ตรงกับ `legs[i]` เสมอไป) */
  legIndex?: number;
  datasetName: string;
  formulaName: string;
  nBet: number;
  betPerNumber: number;
  payoutRate: number;
  sortedNums: readonly string[];
  testStr: string;
  digits: number;
  stepBets: BetSet[] | null;
  monthSets: Map<number, string[]> | null;
}

export interface PortfolioRunResult {
  details: LegDetail[];
  totalEquityCurve: number[];
  totalProfit: number;
  maxPortfolioLoss: number;
  capital: number;
}

/** `backtest.run_portfolio` — รันทุกขาพร้อมกันทีละ "วันปฏิทิน" */
export function runPortfolio(configs: readonly LegRunConfig[], capital: number): PortfolioRunResult {
  const details: LegDetail[] = [];
  let maxSteps = 0;
  for (const cfg of configs) {
    const digits = cfg.digits;
    const testList: string[] = [];
    for (let i = 0; i < cfg.testStr.length; i += digits) testList.push(cfg.testStr.slice(i, i + digits));
    maxSteps = Math.max(maxSteps, testList.length);
    // ขารายเดือน: sortedNums = เลขรวมทุกเดือน (nBet เป็นแค่เดือนที่แทงเยอะสุด)
    // → เก็บทั้งก้อนไว้โชว์ ส่วนการคิดผลรายงวดใช้ stepBets ผ่าน `legBetAt`
    const betNumbers = cfg.stepBets
      ? new Set(cfg.sortedNums)
      : new Set(cfg.sortedNums.slice(0, cfg.nBet));
    details.push({
      name: cfg.datasetName,
      formula: cfg.formulaName,
      nBet: cfg.nBet,
      betNumbers,
      betPerNumber: cfg.betPerNumber,
      payoutRate: cfg.payoutRate,
      testList,
      digits,
      stepBets: cfg.stepBets,
      monthSets: cfg.monthSets,
      currentProfit: 0,
      maxRealLoss: 0,
      profitCurve: [0],
    });
  }

  const totalEquity = [capital];
  let currentTotal = capital;
  let maxPortLoss = 0;

  for (let step = 0; step < maxSteps; step += 1) {
    let dailyPnl = 0;
    for (const d of details) {
      if (step < d.testList.length) {
        const draw = d.testList[step];
        let pnl = 0;
        if (!isSkip(draw, d.digits)) {
          const [nums, nBet] = legBetAt(d, step);
          const cost = nBet * d.betPerNumber;
          const prize = nums.has(draw) ? d.betPerNumber * d.payoutRate : 0;
          pnl = prize - cost;
        }
        d.currentProfit += pnl;
        dailyPnl += pnl;
        if (d.currentProfit < 0) {
          const loss = Math.abs(d.currentProfit);
          if (loss > d.maxRealLoss) d.maxRealLoss = loss;
        }
      }
      // ⚠️ append นอก if — ขาที่ข้อมูลสั้นกว่าขาอื่นต้องมีจุดของทุกวันเหมือนกัน
      d.profitCurve.push(d.currentProfit);
    }
    currentTotal += dailyPnl;
    totalEquity.push(currentTotal);
    if (currentTotal < capital) {
      const loss = capital - currentTotal;
      if (loss > maxPortLoss) maxPortLoss = loss;
    }
  }

  return {
    details,
    totalEquityCurve: totalEquity,
    totalProfit: currentTotal - capital,
    maxPortfolioLoss: maxPortLoss,
    capital,
  };
}

/**
 * `backtest.rank_n_bet` — จำนวนเลขของ "อันดับที่ rank"
 * ⚠️⚠️ กวาดทุก size **บน train เท่านั้น** (ส่ง train เป็น test) ห้ามแตะปี test
 */
export function rankNBet(options: {
  trainStr: string;
  sortedNums: readonly string[];
  capital: number;
  betPerNumber: number;
  payoutRate: number;
  rank?: number;
}): number | null {
  const results = runAllSizes({
    testStr: options.trainStr,
    sortedNums: options.sortedNums,
    capital: options.capital,
    betPerNumber: options.betPerNumber,
    payoutRate: options.payoutRate,
  }).results;
  if (results.length === 0) return null;
  const idx = Math.max(0, Math.min(Math.trunc(options.rank ?? 1) - 1, results.length - 1));
  return results[idx].size;
}

/* ─────────────────────────── replay_portfolio ─────────────────────────── */

export interface ReplayResult extends PortfolioRunResult {
  configs: LegRunConfig[];
  /** ขาที่ข้ามไป (ข้อมูลหาย/สูตรไม่พบ) — โชว์ให้เห็น อย่ากลืนเงียบ ๆ */
  warnings: string[];
}

/** `backtest.replay_portfolio` — legs config (canonical) → ผลรันทั้งพอร์ต */
export function replayPortfolio(
  legs: readonly PortfolioLegConfig[],
  capital: number,
  sequences: readonly DatasetSequence[],
): ReplayResult {
  const lookup = indexSequences(sequences);
  const configs: LegRunConfig[] = [];
  const warnings: string[] = [];

  for (const [legIndex, leg] of legs.entries()) {
    const digits = Number(leg.digits ?? 2);
    const label = `${leg.flag ?? ""} ${leg.lottery ?? ""} · ${leg.position ?? ""}`;

    let trainStr = "";
    let testStr = "";
    if (digits === 3) {
      // 3 ตัวบน — test จาก datasets_3d, ไม่มี train (รองรับเฉพาะ manual)
      testStr = lookup.get(leg.lottery, leg.position, leg.test_year, 3)?.sequence ?? "";
      if (!testStr) {
        warnings.push(`${label}: ไม่มีข้อมูล 3 ตัว ปี ${leg.test_year}`);
        continue;
      }
    } else {
      try {
        const strings = trainTestStrings({
          lookup,
          lottery: leg.lottery,
          position: leg.position,
          digits,
          trainYears: leg.train_years ?? [],
          testYear: leg.test_year,
          trainMonths: leg.train_months,
          testMonths: leg.test_months,
        });
        trainStr = strings.trainStr;
        testStr = strings.testStr;
      } catch (error) {
        warnings.push(`${label}: ดึงข้อมูลไม่ได้ (${(error as Error).message})`);
        continue;
      }
      if (!testStr) {
        warnings.push(`${label}: ไม่มีข้อมูล test ปี ${leg.test_year}`);
        continue;
      }
    }

    const mode = digits === 3 ? "manual" : (leg.mode ?? "auto");

    let sortedNums: readonly string[];
    let nBet: number;
    let stepBets: BetSet[] | null = null;
    let monthSets: Map<number, string[]> | null = null;

    if (mode === "manual") {
      let plan: BetPlan;
      try {
        plan = manualBetPlan(leg, testStr, digits);
      } catch (error) {
        warnings.push(`${label}: ตั้งเลขรายเดือนไม่ได้ (${(error as Error).message})`);
        continue;
      }
      if (plan.sortedNums.length === 0) {
        warnings.push(`${label}: โหมด manual แต่ไม่มีเลข`);
        continue;
      }
      sortedNums = plan.sortedNums;
      nBet = plan.nBet;
      stepBets = plan.stepBets;
      monthSets = plan.monthSets;
    } else {
      if (!trainStr) {
        warnings.push(`${label}: ไม่มีข้อมูล train`);
        continue;
      }
      const fname = leg.formula_name;
      const formula = fname ? FORMULAS[fname] : undefined;
      if (!fname || !formula) {
        warnings.push(`${label}: สูตร ${JSON.stringify(fname)} ไม่พบ`);
        continue;
      }
      sortedNums = formula(trainStr);
      if (sortedNums.length === 0) {
        warnings.push(`${label}: สูตรคืนค่าว่าง`);
        continue;
      }
      if (mode === "fixed_n") {
        const wanted = Number(leg.n_bet) || sortedNums.length;
        nBet = Math.max(1, Math.min(Math.trunc(wanted), sortedNums.length));
      } else {
        // ⚠️⚠️ จัดอันดับจาก train เท่านั้น (walk-forward) — ใช้ผลปี test เลือก size
        // แล้ววัดผลบนปีเดียวกัน = hindsight ตัวเลขโป่งเกินจริง
        const picked = rankNBet({
          trainStr,
          sortedNums,
          capital: Math.trunc(capital),
          betPerNumber: Math.trunc(leg.bet_per_number),
          payoutRate: Math.trunc(leg.payout_rate),
          rank: mode === "rank" ? Math.trunc(Number(leg.rank ?? 1)) : 1,
        });
        if (picked == null) {
          warnings.push(`${label}: รัน train ไม่ได้ผล`);
          continue;
        }
        nBet = picked;
      }
    }

    // ⚠️ รูปแบบชื่อนี้ถูกใช้เป็น "คีย์" ผูก detail กลับเข้า leg ทั้งฝั่ง report และ compare
    // ของ lottery-app — แก้รูปแบบ = พังหลายที่พร้อมกัน
    const name = `${leg.flag ?? ""} ${leg.lottery ?? ""} · ${leg.position ?? ""} (เทส ${leg.test_year})`;
    configs.push({
      legIndex,
      datasetName: name,
      formulaName: (leg.formula_name || mode) + (monthSets ? " · รายเดือน" : ""),
      nBet,
      betPerNumber: Math.trunc(leg.bet_per_number),
      payoutRate: Math.trunc(leg.payout_rate),
      sortedNums,
      testStr,
      digits,
      stepBets,
      monthSets,
    });
  }

  const run = runPortfolio(configs, Math.trunc(capital));
  return { ...run, configs, warnings };
}

/* ─────────────────────────── ตัวเลขรายเดือน / DD ─────────────────────────── */

/** `backtest.drawdown_in_span` — ร่วงจากยอดสูงสุด **ภายในช่วง** (≤ 0) */
export function drawdownInSpan(curve: readonly number[], iStart: number, iEnd: number): number {
  const n = curve?.length ?? 0;
  if (n === 0) return 0;
  const i0 = Math.max(0, Math.min(Math.trunc(iStart), n - 1));
  const i1 = Math.max(i0, Math.min(Math.trunc(iEnd), n - 1));
  let peak = curve[i0];
  let dd = 0;
  for (let k = i0; k <= i1; k += 1) {
    const v = curve[k];
    if (v > peak) peak = v;
    if (v - peak < dd) dd = v - peak;
  }
  return pyRound(dd, 0);
}

export interface MonthlyRow {
  label: string;
  capitalStart: number;
  profit: number;
  maxDd: number;
  idxStart: number;
  idxEnd: number;
}

/**
 * `backtest.portfolio_monthly_pnl` — สรุปรายเดือนของเส้นทุนพอร์ต
 * ⚠️ index ของเส้นทุน = **วันปฏิทิน** (index 0 = ทุนก่อนเริ่ม) ห้ามหารด้วยจำนวนงวด
 */
export function portfolioMonthlyPnl(curve: readonly number[], yearBe: string): MonthlyRow[] {
  if ((curve?.length ?? 0) < 2) return [];
  let ce: number;
  try {
    ce = yearBeToCe(yearBe);
  } catch {
    return [];
  }
  const nDays = curve.length - 1;

  const bounds: [string, number][] = [[EN_MONTH_ABBR[1], 0]];
  for (let month = 2; month <= 12; month += 1) {
    const idx = monthStartIndex(ce, month);
    if (idx >= nDays) break;
    bounds.push([EN_MONTH_ABBR[month], idx]);
  }
  bounds.push(["_end", nDays]);

  const rows: MonthlyRow[] = [];
  for (let i = 0; i < bounds.length - 1; i += 1) {
    const [label, start] = bounds[i];
    const end = bounds[i + 1][1];
    if (start >= end) continue;
    rows.push({
      label,
      capitalStart: Math.trunc(curve[start]),
      profit: Math.trunc(curve[end] - curve[start]),
      maxDd: drawdownInSpan(curve, start, end),
      idxStart: start,
      idxEnd: end,
    });
  }
  return rows;
}

/* ─────────────────────────── "ข้อมูลถึง" (as_of) ─────────────────────────── */

interface DrawInfo {
  year: string;
  drawNo: number;
  date: Date | null;
}

/**
 * งวดจริงล่าสุดของกลุ่มนั้น (`db.latest_draw_info` / `latest_draw_info_3d`)
 *
 * ⚠️ ดูได้แค่ **ปีที่โหลดมาให้** — ฝั่ง Python มองทุกปีใน DB · ตราบใดที่ปี test
 * ของขาคือปีล่าสุด (กรณีปกติ) สองฝั่งได้ค่าเดียวกัน · `export_portfolio_fixture.py`
 * เตือนให้เองถ้าเจอพอร์ตที่ไม่เป็นแบบนั้น
 */
function latestDrawInfo(
  lookup: SequenceLookup,
  lottery: string,
  position: string,
  digits: number,
): DrawInfo | null {
  const rows = lookup.years(lottery, position, digits);
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    const seq = row.sequence ?? "";
    const realIdx: number[] = [];
    for (let k = 0; k * digits < seq.length; k += 1) {
      const chunk = seq.slice(k * digits, (k + 1) * digits);
      if (chunk.length === digits && isDigits(chunk)) realIdx.push(k);
    }
    if (realIdx.length === 0) continue;
    // datasets_3d เป็น calendar-indexed เสมอ → แปลง index เป็นวันที่ได้ตรง ๆ
    const sorted = digits === 3 ? true : row.isDateSorted;
    return {
      year: row.year,
      drawNo: realIdx.length,
      date: sorted ? dayOf(yearBeToCe(row.year), realIdx[realIdx.length - 1]) : null,
    };
  }
  return null;
}

/** ขาที่ผลหวยมาไม่ถึงวันเดียวกับขาอื่น */
export interface LegLag {
  /** "🇱🇦 หวยลาว VIP · สามบน" */
  label: string;
  /** งวดจริงล่าสุดที่มีของขานี้ — null = entry ไม่ได้เรียงตามวันที่ (แปลงเป็นวันที่ไม่ได้) */
  date: Date | null;
}

/**
 * ขาที่ผลหวย **มาไม่ถึงวันล่าสุดของพอร์ต** — เงียบที่สุดในบรรดาความผิดพลาดทั้งหมด
 *
 * งวดที่ยังไม่มีผลถูกข้ามไปเฉย ๆ (ต้นทุน 0 · กำไร 0 — ไม่ใช่แพ้) ⇒ ยอดรวมของเดือน
 * **น้อยกว่าความจริง** โดยไม่มีอะไรฟ้อง · เคยกินเวลาไล่หากันทั้งวันเพราะยอดในเว็บกับ
 * ที่เจ้าของคิดมือต่างกัน 8,710 บาท ซึ่งก็คือ 3 ขาที่ยังไม่ได้กรอกผลของวันนั้นพอดี
 *
 * ⚠️ เทียบกับ **ขาที่ใหม่สุดในพอร์ตเดียวกัน** ไม่ใช่ "วันนี้" — หวยแต่ละตัวออกคนละเวลา
 * และหวยหุ้นไม่ออกเสาร์-อาทิตย์ ⇒ วัดกับวันนี้จะเตือนผิดทุกเช้า
 */
export function legsBehind(
  legs: readonly PortfolioLegConfig[],
  sequences: readonly DatasetSequence[],
): { newest: Date | null; behind: LegLag[] } {
  const lookup = indexSequences(sequences);
  const rows: LegLag[] = [];
  let newest: Date | null = null;

  for (const leg of legs) {
    if (!leg.lottery) continue;
    const digits = Number(leg.digits ?? 2);
    const info = latestDrawInfo(lookup, leg.lottery, leg.position ?? "", digits);
    if (!info?.date) continue;
    rows.push({
      label: `${leg.flag ?? "🎰"} ${leg.lottery} · ${leg.position}`,
      date: info.date,
    });
    if (newest === null || info.date.getTime() > newest.getTime()) newest = info.date;
  }

  if (newest === null) return { newest: null, behind: [] };
  const cutoff = newest.getTime();
  return { newest, behind: rows.filter((row) => (row.date?.getTime() ?? cutoff) < cutoff) };
}

/** วันที่แบบไทยของงวดล่าสุด — ใช้โชว์คู่กับ `legsBehind` */
export function thaiDateOf(date: Date): string {
  return thaiDate(date);
}

/** `page_utils.portfolio_as_of` — ขาที่ข้อมูล **เก่าสุด** (ตัวที่จำกัดความน่าเชื่อ) */
export function portfolioAsOf(
  legs: readonly PortfolioLegConfig[],
  sequences: readonly DatasetSequence[],
): string {
  const lookup = indexSequences(sequences);
  let bestOrdinal = 0;
  let bestLottery = "";
  let bestText: string | null = null;
  for (const leg of legs) {
    const lottery = leg.lottery;
    if (!lottery) continue;
    const digits = Number(leg.digits ?? 2);
    const info = latestDrawInfo(lookup, lottery, leg.position ?? "", digits);
    if (!info) continue;
    const ordinal = info.date ? Math.round(info.date.getTime() / DAY_MS) : 1e9;
    const text = info.date
      ? `${thaiDate(info.date)} · ${lottery}`
      : `งวดที่ ${info.drawNo} ปี ${info.year} · ${lottery}`;
    const isOlder =
      bestText === null ||
      ordinal < bestOrdinal ||
      (ordinal === bestOrdinal && lottery < bestLottery);
    if (isOlder) {
      bestOrdinal = ordinal;
      bestLottery = lottery;
      bestText = text;
    }
  }
  return bestText ?? "";
}

/* ─────────────────────────── snapshot ─────────────────────────── */

/** (ถูกกี่งวด, แทงกี่งวด) — ข้ามวันหยุด **และงวดที่ขาไม่ได้แทง** (n=0) */
function legWinRate(detail: LegDetail): { wins: number; draws: number } {
  let wins = 0;
  let draws = 0;
  for (let i = 0; i < detail.testList.length; i += 1) {
    const draw = detail.testList[i];
    if (isSkip(draw, detail.digits)) continue;
    const [nums, n] = legBetAt(detail, i);
    if (n === 0) continue;
    draws += 1;
    if (nums.has(draw)) wins += 1;
  }
  return { wins, draws };
}

function buildLegs(result: PortfolioRunResult, monthly: readonly MonthlyRow[]): PortfolioLeg[] {
  return result.details.map((d, i) => {
    const curve = d.profitCurve.map((v) => pyRound(v, 0));
    const risk = computeRiskMetrics(d.profitCurve);
    const spans = monthly.map((m) => drawdownInSpan(d.profitCurve, m.idxStart, m.idxEnd));
    const worstDd = spans.length > 0 ? Math.min(...spans) : 0;
    const { wins, draws } = legWinRate(d);
    const monthSets: Record<string, string[]> = {};
    for (const month of [...(d.monthSets?.keys() ?? [])].sort((a, b) => a - b)) {
      monthSets[String(month)] = [...(d.monthSets?.get(month) ?? [])].sort();
    }
    return {
      index: i + 1,
      name: d.name,
      formula: d.formula,
      digits: d.digits,
      nBet: d.nBet,
      betPerNumber: d.betPerNumber,
      payoutRate: d.payoutRate,
      profit: Math.trunc(d.currentProfit),
      maxRealLoss: Math.trunc(d.maxRealLoss),
      worstMonthDd: Math.trunc(worstDd),
      lossStreak: risk.maxLossStreak,
      lossStreakAmount: Math.trunc(risk.maxLossStreakAmount),
      wins,
      draws,
      winRate: draws > 0 ? pyRound((wins / draws) * 100, 2) : 0,
      curve,
      numbers: [...d.betNumbers].sort(),
      monthSets,
    };
  });
}

/** ISO ที่ timespec="seconds" ของ Python ในเขตเวลาไทย เช่น `2026-09-04T10:03:10+07:00` */
function bkkIsoSeconds(when: Date): string {
  const shifted = new Date(when.getTime() + 7 * 3_600_000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}` +
    `T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}:${pad(shifted.getUTCSeconds())}+07:00`
  );
}

/**
 * คำนวณพอร์ตทั้งก้อน → snapshot รูปเดียวกับที่ Python ส่งมา
 *
 * โยน Error ถ้าไม่มีขาไหนรันได้เลย — ห้ามให้หน้าจอ "เดา" ตัวเลขเอง โชว์ไปตรง ๆ
 * ว่ายังคำนวณไม่ได้ ดีกว่าโชว์เลขที่ไม่มีใครรู้ว่ามาจากไหน
 */
export function computeSnapshot(input: ComputeInput): PortfolioSnapshot {
  const { portfolio, sequences } = input;
  const legsCfg = portfolio.config.legs ?? [];
  const result = replayPortfolio(legsCfg, Math.trunc(portfolio.capital ?? 0), sequences);
  if (result.details.length === 0) {
    const why = result.warnings.length > 0 ? ` — ${result.warnings.join(" · ")}` : "";
    throw new Error(`พอร์ต ${JSON.stringify(portfolio.name)} รันไม่ได้ ไม่มีขาที่มีข้อมูล${why}`);
  }

  const totalEq = result.totalEquityCurve;
  const risk = computeRiskMetrics(totalEq);
  const profit = Math.trunc(result.totalProfit);
  const capital = Math.trunc(result.capital);

  const testYears = [...new Set(legsCfg.map((leg) => String(leg.test_year)).filter(Boolean))].sort();
  const repYear = testYears.length > 0 ? testYears[testYears.length - 1] : null;
  const monthlyRows = repYear ? portfolioMonthlyPnl(totalEq, repYear) : [];

  let worstDd = 0;
  let worstMonth = "";
  if (monthlyRows.length > 0) {
    // idxmin ของ pandas = ตัวแรกที่ต่ำสุด (เสมอกันเอาเดือนที่มาก่อน)
    let best = 0;
    for (let i = 1; i < monthlyRows.length; i += 1) {
      if (monthlyRows[i].maxDd < monthlyRows[best].maxDd) best = i;
    }
    worstDd = Math.trunc(monthlyRows[best].maxDd);
    worstMonth = monthlyRows[best].label;
  }

  const legs = buildLegs(result, monthlyRows);
  const wins = legs.reduce((sum, leg) => sum + leg.wins, 0);
  const draws = legs.reduce((sum, leg) => sum + leg.draws, 0);
  const maxDd = Math.trunc(result.maxPortfolioLoss);
  const worstLossRunAmount = Math.trunc(risk.worstLossRunAmount);

  const monthly: PortfolioMonth[] = monthlyRows.map((m) => ({
    label: m.label,
    capitalStart: m.capitalStart,
    profit: m.profit,
    maxDd: m.maxDd,
    idxStart: m.idxStart,
    idxEnd: m.idxEnd,
  }));

  const generatedAt = bkkIsoSeconds(input.generatedAt ?? new Date());

  return {
    portfolioId: portfolio.id,
    name: portfolio.name ?? "",
    isActive: Boolean(portfolio.config.is_active),
    version: SNAPSHOT_VERSION,
    generatedAt,
    // ฝั่ง Python ไม่มีช่องนี้ (API เป็นคนประทับตอนรับ) — คำนวณเองที่นี่ = รับตอนคำนวณเสร็จ
    receivedAt: generatedAt,
    capital,
    nLegs: legs.length,
    testYears,
    asOf: portfolioAsOf(legsCfg, sequences),
    kpi: {
      capital,
      profit,
      roiPct: capital ? pyRound((profit / capital) * 100, 2) : 0,
      maxDrawdown: maxDd,
      sharpe: pyRound(risk.sharpe, 3),
      // ไม่เคยขาดทุนเลย = ∞ ซึ่ง JSON ไม่มี → null แล้วให้หน้าจอโชว์ "∞"
      profitFactor: risk.profitFactor == null ? null : pyRound(risk.profitFactor, 3),
      maxWinStreak: risk.maxWinStreak,
      maxLossStreak: risk.maxLossStreak,
      maxLossStreakAmount: Math.trunc(risk.maxLossStreakAmount),
      worstLossRunLen: risk.worstLossRunLen,
      worstLossRunAmount,
      reserveNeeded: Math.max(maxDd, Math.abs(worstLossRunAmount)),
      worstMonthDd: worstDd,
      worstMonthLabel: worstMonth,
      wins,
      draws,
      winRate: draws > 0 ? pyRound((wins / draws) * 100, 2) : 0,
    },
    equity: {
      capital,
      values: totalEq.map((v) => pyRound(v, 0)),
      // (label, index) ของต้นเดือน — index เป็น "วันปฏิทิน" ตามเส้นทุนพอร์ต
      monthDivs: monthly.filter((m) => m.idxStart > 0).map((m) => [m.label, m.idxStart] as [string, number]),
    },
    monthly,
    legs,
  };
}
