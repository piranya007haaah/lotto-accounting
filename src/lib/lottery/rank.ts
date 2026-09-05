/**
 * จัดอันดับ "หวยไหนใช้สูตรนี้แล้วได้กำไรดีสุด" — หัวใจของหน้า `/formulas`
 *
 * พอร์ตมาจากหน้า `pages/2_🧪_เลือกสูตร.py` ของแอป Streamlit (`_rank_one_cached` /
 * `_rank_groups`) ⇒ ตัวเลขต้องออกมาเท่ากันเป๊ะ ตราบใดที่สองแอปยังอยู่ด้วยกัน
 *
 * กติกาที่ยกมาทั้งดุ้น (พลาดแล้วตัวเลขโป่งแบบไม่มีใครจับได้):
 * - ⚠️⚠️ **โหมด Train-based เลือก n_bet จาก train เท่านั้น** แล้วค่อยเอา n นั้นไปวัดผล
 *   บน test · โหมด Hindsight เลือกจาก test ซึ่งรู้ผลแล้ว = ใช้ตัดสินใจอนาคตไม่ได้
 *   (มีไว้ดูเพดานทฤษฎีเท่านั้น หน้าจอต้องเตือนทุกครั้ง)
 * - train = **ทุกปีที่อยู่ก่อนปี test** ต่อกันเป็นสตริงเดียว (สูตรนับความถี่เป็นคู่ ๆ
 *   การต่อสตริงจึงไม่ทำให้เพี้ยน) — ปีหลัง test ห้ามแตะ = ไม่มี lookahead
 *   · เลือกเองได้ด้วย `trainYears` (เช่นอยากเทรนแค่ 2 ปีล่าสุด) แต่ **กรองปี ≥ test
 *   ทิ้งเสมอ** ไม่ว่าคนเรียกจะส่งอะไรมา — lookahead ต้องเป็นไปไม่ได้ ไม่ใช่แค่ไม่ควรทำ
 * - ตารางนี้อ่านเฉพาะขา **2 ตัว** (`readAllDatasetRows({digits: 2})`) — ตาราง
 *   `lottery_datasets` มีสามบนปนอยู่ด้วย ซึ่งสูตร 2 ตัวอ่านแล้วได้เลขมั่ว
 */

import { equityCurve, randomBaseline, runAllSizes, type BacktestParams, type SizeResult } from "./engine";
import { FORMULAS } from "./formulas";

export type RankMode = "train" | "hindsight";

/** 1 แถวของตาราง `lottery_datasets` (เท่าที่การจัดอันดับต้องใช้) */
export interface DatasetRow {
  lottery: string;
  position: string;
  flag: string;
  year: string;
  sequence: string;
  /** 1 งวด = กี่ตัวอักษร (2 = สองบน/สองล่าง · 3 = สามบน) — แถวเก่าที่ยังไม่มีค่า = 2 */
  digits?: number;
}

export interface RankRow {
  lottery: string;
  position: string;
  flag: string;
  trainYears: string[];
  /** n_bet ที่โหมดนั้นเลือกได้ */
  nBet: number;
  profit: number;
  /** ROI ต่อ **เงินหมุน** (n × เงินแทง × งวด) ไม่ใช่ต่อทุนตั้งต้น — เทียบข้ามหวยได้ */
  roiPct: number;
  winRate: number;
  wins: number;
  days: number;
  maxDrawdown: number;
  /** กำไรนี้เกิน "สุ่มล้วน" กี่ SD — null = คำนวณไม่ได้ (งวดน้อยเกิน) */
  z: number | null;
}

/** กลุ่ม = หวย + ตำแหน่ง (สองบน/สองล่าง) พร้อมสตริงผลของแต่ละปี */
export interface Group {
  lottery: string;
  position: string;
  flag: string;
  years: Map<string, string>;
}

export function groupRows(rows: readonly DatasetRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.lottery}|${row.position}`;
    const group = groups.get(key) ?? {
      lottery: row.lottery,
      position: row.position,
      flag: row.flag || "🎰",
      years: new Map<string, string>(),
    };
    group.years.set(row.year, row.sequence ?? "");
    groups.set(key, group);
  }
  return [...groups.values()];
}

/**
 * ปีที่ใช้เทรน เรียงจากเก่า→ใหม่ (ปีเป็น พ.ศ. 2 หลัก เช่น "64")
 *
 * `only` = เจาะจงว่าจะเอาปีไหนบ้าง (ไม่ส่ง/ส่งลิสต์ว่าง = ทุกปีก่อน test เหมือนเดิม)
 * ⚠️ เงื่อนไข `year < testYear` อยู่นอก `only` เสมอ — คนเรียกส่งปี test หรือปีหลัง
 * เข้ามาก็ต้องถูกทิ้ง ไม่งั้นได้ผลลัพธ์ที่ "รู้อนาคต" โดยหน้าจอไม่มีทางรู้เลย
 */
export function trainYearsOf(
  years: Iterable<string>,
  testYear: string,
  only?: readonly string[],
): string[] {
  const allow = only && only.length > 0 ? new Set(only) : null;
  return [...years].filter((year) => year < testYear && (!allow || allow.has(year))).sort();
}

export interface GroupStrings {
  trainStr: string;
  testStr: string;
  trainYears: string[];
}

export function stringsFor(
  group: Group,
  testYear: string,
  onlyTrainYears?: readonly string[],
): GroupStrings | null {
  const testStr = group.years.get(testYear) ?? "";
  const trainYears = trainYearsOf(group.years.keys(), testYear, onlyTrainYears);
  if (!testStr || trainYears.length === 0) return null;
  const trainStr = trainYears.map((year) => group.years.get(year) ?? "").join("");
  if (!trainStr) return null;
  return { trainStr, testStr, trainYears };
}

/**
 * n_bet ที่เลือกได้ตามโหมด + ผลของ n นั้นบน test
 *
 * ⚠️ Train-based เรียก `runAllSizes` สองรอบโดย **รอบแรกใช้ train เป็น test** —
 * ตรงกับที่ Python ทำ (`run_all_sizes(train_str=train, test_str=train, ...)`)
 * ไม่ใช่การ "จัดอันดับบน test แล้วเลือกอันดับ 1" ซึ่งเป็นคนละเรื่องกันสิ้นเชิง
 */
export function pickSize(
  strings: GroupStrings,
  sortedNums: readonly string[],
  params: BacktestParams,
  mode: RankMode,
): { chosen: SizeResult; testResults: SizeResult[]; trainResults: SizeResult[] } | null {
  const test = runAllSizes({ testStr: strings.testStr, sortedNums, ...params });
  if (test.results.length === 0) return null;
  if (mode === "hindsight") {
    return { chosen: test.results[0], testResults: test.results, trainResults: [] };
  }

  const train = runAllSizes({ testStr: strings.trainStr, sortedNums, ...params });
  if (train.results.length === 0) return null;
  const size = train.results[0].size;
  const chosen = test.results.find((result) => result.size === size);
  if (!chosen) return null;
  return { chosen, testResults: test.results, trainResults: train.results };
}

export interface RankOptions extends BacktestParams {
  rows: readonly DatasetRow[];
  formula: string;
  testYear: string;
  mode: RankMode;
  /** เจาะจงปีที่ใช้เทรน — ไม่ส่ง = ทุกปีก่อน test (ของเดิม) · หวยที่ไม่มีปีที่เลือกเลยจะหลุดจากตาราง */
  trainYears?: readonly string[];
}

/** ตารางอันดับของทุกกลุ่มที่มีปี test นั้น — เรียงกำไรมาก→น้อย */
export function rankGroups(options: RankOptions): RankRow[] {
  const formulaFn = FORMULAS[options.formula];
  if (!formulaFn) throw new Error(`ไม่รู้จักสูตร "${options.formula}"`);
  const params: BacktestParams = {
    capital: options.capital,
    betPerNumber: options.betPerNumber,
    payoutRate: options.payoutRate,
  };

  const out: RankRow[] = [];
  for (const group of groupRows(options.rows)) {
    const strings = stringsFor(group, options.testYear, options.trainYears);
    if (!strings) continue;
    const sortedNums = formulaFn(strings.trainStr);
    const picked = pickSize(strings, sortedNums, params, options.mode);
    if (!picked) continue;

    const { chosen } = picked;
    const turnover = chosen.size * params.betPerNumber * chosen.actualDays;
    const baseline = randomBaseline({
      nBet: chosen.size,
      actualDays: chosen.actualDays,
      betPerNumber: params.betPerNumber,
      payoutRate: params.payoutRate,
      actualProfit: chosen.profit,
    });
    out.push({
      lottery: group.lottery,
      position: group.position,
      flag: group.flag,
      trainYears: strings.trainYears,
      nBet: chosen.size,
      profit: chosen.profit,
      roiPct: turnover > 0 ? (chosen.profit / turnover) * 100 : 0,
      winRate: chosen.winRate,
      wins: chosen.wins,
      days: chosen.actualDays,
      maxDrawdown: chosen.maxDrawdown,
      z: baseline.z,
    });
  }
  out.sort((a, b) => b.profit - a.profit || a.nBet - b.nBet);
  return out;
}

/* ───────────────────────── รายละเอียดของกลุ่มเดียว ───────────────────────── */

export interface RankChoice {
  /** อันดับที่ 1..10 — Train-based = อันดับบน train · Hindsight = อันดับบน test */
  rank: number;
  size: number;
  profit: number;
  winRate: number;
  wins: number;
  days: number;
  maxDrawdown: number;
  /** อันดับของ n นี้ในตาราง test (Train-based เท่านั้น) — ≤10 = train เดาไม่หลุด */
  testRank: number;
  trainProfit: number | null;
}

/** ชื่อเดือนย่ออังกฤษ — ตรงกับ `strftime("%b")` ที่ `db.chart_month_dividers` ใช้ */
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `db.chart_month_dividers` — ตำแหน่งบนแกน X ของกราฟที่เป็น "วันที่ 1 ของเดือน"
 *
 * ⚠️⚠️ กราฟ **รายหวย** ใช้ index ตาม **งวดจริง** (ข้ามวันหยุด) ไม่ใช่วันปฏิทิน —
 * คนละระบบกับเส้นทุนของ *พอร์ต* ที่นับทุกวันปฏิทิน · สลับกันเมื่อไหร่เส้นแบ่งเดือน
 * จะไปตกผิดที่ทั้งเส้นโดยกราฟยังดูสวยอยู่
 *
 * sequence ยังเป็น calendar-indexed เหมือนเดิม (1 ช่อง = 1 วันจาก 1 ม.ค.) —
 * ที่แปลงคือ "วันปฏิทินที่ n" → "งวดจริงที่เท่าไหร่"
 */
export function drawMonthDividers(testStr: string, yearBe: string, digits = 2): [string, number][] {
  const ce = 2500 + Number(yearBe) - 543;
  if (!Number.isFinite(ce) || !testStr) return [];

  const nCal = Math.floor(testStr.length / digits);
  if (nCal === 0) return [];

  // calToDraw[k] = จำนวนงวดจริงในวันที่ index 0..k-1
  const calToDraw = new Array<number>(nCal + 1).fill(0);
  let drawIdx = 0;
  for (let day = 0; day < nCal; day += 1) {
    const cell = testStr.slice(day * digits, (day + 1) * digits);
    if (cell.length === digits && /^\d+$/.test(cell)) drawIdx += 1;
    calToDraw[day + 1] = drawIdx;
  }

  const jan1 = Date.UTC(ce, 0, 1);
  const out: [string, number][] = [];
  for (let month = 2; month <= 12; month += 1) {
    const calDay = Math.round((Date.UTC(ce, month - 1, 1) - jan1) / 86_400_000);
    if (calDay >= nCal) break;
    out.push([EN_MONTHS[month - 1], calToDraw[calDay]]);
  }
  return out;
}

/** ช่วงหนึ่งเดือนของเส้นทุนรายหวย — รูปเดียวกับ `PortfolioMonth` ⇒ ส่งเข้ากราฟได้ตรง ๆ */
export interface EquityMonth {
  label: string;
  capitalStart: number;
  profit: number;
  maxDd: number;
  idxStart: number;
  idxEnd: number;
}

/**
 * หั่นเส้นทุนเป็นรายเดือนด้วยเส้นแบ่งจาก `drawMonthDividers`
 *
 * ⚠️ อยู่ที่นี่ที่เดียว เพราะทั้งหน้าเว็บและ API ที่ส่งการ์ดเข้า LINE ต้องได้เลขชุดเดียวกัน
 * — ก๊อปคนละที่เมื่อไหร่ ตัวเลขบนจอกับในการ์ดจะเริ่มไม่ตรงกันโดยไม่มีใครจับได้
 */
export function monthlyFromEquity(
  equity: readonly number[],
  monthDivs: readonly [string, number][],
): EquityMonth[] {
  if (equity.length < 2) return [];
  const last = equity.length - 1;
  const bounds = [0, ...monthDivs.map(([, at]) => at), last];
  const labels = ["Jan", ...monthDivs.map(([name]) => name)];

  const out: EquityMonth[] = [];
  for (let i = 0; i < labels.length; i += 1) {
    const from = Math.min(bounds[i], last);
    const to = Math.min(bounds[i + 1] ?? last, last);
    if (to <= from) continue; // เดือนที่ไม่มีงวดจริง (หวยออกห่าง/ยังไม่ถึง)
    let peak = equity[from];
    let dd = 0;
    for (let k = from; k <= to; k += 1) {
      if (equity[k] > peak) peak = equity[k];
      if (equity[k] - peak < dd) dd = equity[k] - peak;
    }
    out.push({
      label: labels[i],
      capitalStart: equity[from],
      profit: equity[to] - equity[from],
      maxDd: Math.trunc(dd),
      idxStart: from,
      idxEnd: to,
    });
  }
  return out;
}

export interface GroupAnalysis {
  trainYears: string[];
  numbers: string[];
  choices: RankChoice[];
  /** เส้นทุนของอันดับที่เลือก (index 0 = ทุนตั้งต้น) */
  equityOf: (size: number) => number[];
}

/**
 * Top-10 ของกลุ่มเดียว — ใช้ในหน้าจอตอนกดดูรายละเอียด (คำนวณฝั่ง client)
 *
 * ลำดับของแถวคือ **ลำดับที่โหมดนั้นจัดให้** (train หรือ test) ไม่ใช่เรียงกำไร test
 * ⇒ อันดับ 1 คือ n ที่ "เลือกได้จริงตอนนั้น" ส่วนคอลัมน์อันดับใน test บอกว่าเดาแม่นแค่ไหน
 */
export function analyzeGroup(options: {
  trainStr: string;
  testStr: string;
  trainYears: string[];
  formula: string;
  mode: RankMode;
  topN?: number;
} & BacktestParams): GroupAnalysis | null {
  const formulaFn = FORMULAS[options.formula];
  if (!formulaFn) throw new Error(`ไม่รู้จักสูตร "${options.formula}"`);
  const params: BacktestParams = {
    capital: options.capital,
    betPerNumber: options.betPerNumber,
    payoutRate: options.payoutRate,
  };
  const numbers = formulaFn(options.trainStr);
  const test = runAllSizes({ testStr: options.testStr, sortedNums: numbers, ...params });
  if (test.results.length === 0) return null;

  const topN = options.topN ?? 10;
  const testBySize = new Map(test.results.map((result) => [result.size, result]));
  const testRankBySize = new Map(test.results.map((result, index) => [result.size, index + 1]));

  const choices: RankChoice[] = [];
  if (options.mode === "hindsight") {
    for (const [index, result] of test.results.slice(0, topN).entries()) {
      choices.push({
        rank: index + 1,
        size: result.size,
        profit: result.profit,
        winRate: result.winRate,
        wins: result.wins,
        days: result.actualDays,
        maxDrawdown: result.maxDrawdown,
        testRank: index + 1,
        trainProfit: null,
      });
    }
  } else {
    const train = runAllSizes({ testStr: options.trainStr, sortedNums: numbers, ...params });
    for (const [index, trainResult] of train.results.entries()) {
      if (choices.length >= topN) break;
      const result = testBySize.get(trainResult.size);
      if (!result) continue;
      choices.push({
        rank: index + 1,
        size: result.size,
        profit: result.profit,
        winRate: result.winRate,
        wins: result.wins,
        days: result.actualDays,
        maxDrawdown: result.maxDrawdown,
        testRank: testRankBySize.get(result.size) ?? 0,
        trainProfit: trainResult.profit,
      });
    }
  }
  if (choices.length === 0) return null;

  return {
    trainYears: options.trainYears,
    numbers,
    choices,
    equityOf: (size: number) => equityCurve(test.ranks, size, params),
  };
}
