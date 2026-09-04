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
 * - ตารางนี้มีแต่ขา **2 ตัว** เพราะ `lottery_datasets` รับมาเฉพาะตาราง `datasets`
 *   ของฝั่งโน้น (3 ตัวอยู่คนละตาราง ยังไม่ได้ย้ายมา)
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

/** ปีก่อนหน้า test ทั้งหมด เรียงจากเก่า→ใหม่ (ปีเป็น พ.ศ. 2 หลัก เช่น "64") */
export function trainYearsOf(years: Iterable<string>, testYear: string): string[] {
  return [...years].filter((year) => year < testYear).sort();
}

export interface GroupStrings {
  trainStr: string;
  testStr: string;
  trainYears: string[];
}

export function stringsFor(group: Group, testYear: string): GroupStrings | null {
  const testStr = group.years.get(testYear) ?? "";
  const trainYears = trainYearsOf(group.years.keys(), testYear);
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
    const strings = stringsFor(group, options.testYear);
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
