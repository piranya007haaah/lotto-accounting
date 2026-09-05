/**
 * Walk-forward รายปี — `backtest.walk_forward_by_year` ฝั่ง TypeScript
 *
 * ทุกปีเทรนด้วย **ปีก่อนหน้าทั้งหมด** แล้ววัดผลบนปีนั้น (69←64-68 · 68←64-67 · …)
 * แล้ว **ต่อเส้นทุนข้ามปีเป็นเส้นเดียว** = track record ถ้าใช้สูตรนี้จริงมาตลอด
 *
 * ⚠️⚠️ **ไม่มี lookahead เด็ดขาด**: ทั้งชุดเลข *และ* `n_bet` เห็นเฉพาะข้อมูลก่อนปีที่
 * ทดสอบ · `nBet: null` = จัดอันดับด้วย `runAllSizes` โดยส่ง **train เป็น test**
 * เผลอส่งปี test เข้าไปเมื่อไหร่ ตัวเลขจะสวยขึ้นทันทีแบบไม่มีใครสงสัย
 *
 * ⚠️ index ของ `equityCurve` ที่นี่ = **งวดจริง** (ข้ามวันหยุด) เหมือน
 * `drawMonthDividers` — คนละระบบกับเส้นทุนของพอร์ตที่นับทุกวันปฏิทิน
 */

import { equityCurve, runAllSizes } from "./engine";
import { FORMULAS } from "./formulas";
import { drawMonthDividers } from "./rank";

export interface WalkForwardFold {
  year: string;
  trainYears: string[];
  nBet: number;
  profit: number;
  roiPct: number;
  wins: number;
  actualDays: number;
  winRate: number;
  maxDrawdown: number;
  idxStart: number;
  idxEnd: number;
  worstMonth: string;
  worstMonthDd: number;
}

export interface WalkForwardMonth {
  year: string;
  label: string;
  profit: number;
  /** % ของ **ทุนต้นเดือน** (เส้นทุนวิ่งต่อข้ามปี) ไม่ใช่ทุนเริ่มต้นคงที่ */
  pct: number;
  equityStart: number;
  idxStart: number;
  idxEnd: number;
  maxDd: number;
}

export interface WalkForwardResult {
  capital: number;
  equityCurve: number[];
  totalProfit: number;
  wins: number;
  actualDays: number;
  winRate: number;
  maxDrawdown: number;
  folds: WalkForwardFold[];
  monthly: WalkForwardMonth[];
  warnings: string[];
}

/** `backtest.drawdown_in_span` — ร่วงจากยอดสูงสุด **ภายในช่วง** (ไม่ใช่จากทุนตั้งต้น) */
export function drawdownInSpan(curve: readonly number[], i0: number, i1: number): number {
  const from = Math.max(0, Math.min(i0, curve.length - 1));
  const to = Math.max(from, Math.min(i1, curve.length - 1));
  let peak = curve[from];
  let worst = 0;
  for (let i = from; i <= to; i += 1) {
    if (curve[i] > peak) peak = curve[i];
    const dd = curve[i] - peak;
    if (dd < worst) worst = dd;
  }
  return Math.trunc(worst);
}

/** เดือนที่ร่วงหนักสุดของ fold — `backtest.worst_month_dd` */
function worstMonthOf(months: WalkForwardMonth[]): [string, number] {
  let label = "";
  let worst = 0;
  for (const month of months) {
    if (month.maxDd < worst) {
      worst = month.maxDd;
      label = month.label;
    }
  }
  return [label, worst];
}

export function walkForwardByYear(options: {
  /** [ปี พ.ศ. 2 หลัก, sequence] เรียงปีน้อย → มาก */
  yearSequences: readonly [string, string][];
  formula: string;
  capital: number;
  betPerNumber: number;
  payoutRate: number;
  /** null = เลือก n_bet ที่ดีสุด **บน train** ของแต่ละปี · ตัวเลข = ใช้ค่านั้นทุกปี */
  nBet?: number | null;
  minTrainYears?: number;
  digits?: number;
  maxN?: number;
}): WalkForwardResult {
  const formulaFn = FORMULAS[options.formula];
  if (!formulaFn) throw new Error(`ไม่รู้จักสูตร "${options.formula}"`);

  const digits = options.digits ?? 2;
  const maxN = options.maxN ?? 99;
  const capital = Math.trunc(options.capital);
  const params = { capital: 0, betPerNumber: options.betPerNumber, payoutRate: options.payoutRate };

  const years = [...options.yearSequences];
  const equity: number[] = [capital];
  const folds: WalkForwardFold[] = [];
  const monthly: WalkForwardMonth[] = [];
  const warnings: string[] = [];
  let totalWins = 0;
  let totalDays = 0;

  for (let i = Math.max(1, options.minTrainYears ?? 1); i < years.length; i += 1) {
    const [testYear, testStr] = years[i];
    const trainYears = years.slice(0, i).map(([year]) => year);
    const trainStr = years.slice(0, i).map(([, seq]) => seq).join("");

    if (!trainStr) {
      warnings.push(`ปี ${testYear}: ไม่มีข้อมูล train`);
      continue;
    }
    if (!testStr) {
      warnings.push(`ปี ${testYear}: ไม่มีข้อมูล test`);
      continue;
    }

    const sortedNums = formulaFn(trainStr);
    if (sortedNums.length === 0) {
      warnings.push(`ปี ${testYear}: สูตรคืนค่าว่าง`);
      continue;
    }

    let size: number;
    if (options.nBet == null) {
      // ⚠️ ส่ง train เป็น test — จัดอันดับบนอดีตเท่านั้น ห้ามแตะปีที่กำลังจะทดสอบ
      const onTrain = runAllSizes({ testStr: trainStr, sortedNums, maxN, digits, ...params });
      if (onTrain.results.length === 0) {
        warnings.push(`ปี ${testYear}: จัดอันดับ n_bet บน train ไม่ได้`);
        continue;
      }
      size = onTrain.results[0].size;
    } else {
      size = Math.max(1, Math.min(Math.trunc(options.nBet), sortedNums.length));
    }

    const onTest = runAllSizes({ testStr, sortedNums, maxN: sortedNums.length, digits, ...params });
    if (onTest.actualDays <= 0) {
      warnings.push(`ปี ${testYear}: ไม่มีงวดจริง`);
      continue;
    }
    // capital = 0 ⇒ เส้นนี้เป็น "กำไรสะสม" ของ fold เอาไปต่อท้ายเส้นรวมได้ตรง ๆ
    const pnlCurve = equityCurve(onTest.ranks, size, params);
    const picked = onTest.results.find((item) => item.size === size);
    if (!picked) {
      warnings.push(`ปี ${testYear}: ไม่มีผลของ n_bet ${size}`);
      continue;
    }

    const idxStart = equity.length - 1;
    const base = equity[equity.length - 1];
    for (let k = 1; k < pnlCurve.length; k += 1) equity.push(base + Math.trunc(pnlCurve[k]));
    const idxEnd = equity.length - 1;

    // รายเดือนของปีนี้ — index ตามงวดจริง เหมือน chart_month_dividers
    const divs = drawMonthDividers(testStr, testYear, digits);
    const bounds: [string, number][] = [["Jan", 0], ...divs, ["_end", pnlCurve.length - 1]];
    const fromMonths: WalkForwardMonth[] = [];
    for (let j = 0; j < bounds.length - 1; j += 1) {
      const [label, x0] = bounds[j];
      const x1 = Math.min(bounds[j + 1][1], pnlCurve.length - 1);
      if (x1 <= x0) continue; // เดือนที่ไม่มีงวดจริง (หวยออกห่าง/ยังไม่ถึง)
      const profitM = Math.trunc(pnlCurve[x1]) - Math.trunc(pnlCurve[x0]);
      const eqStart = Math.trunc(equity[idxStart + x0]);
      const row: WalkForwardMonth = {
        year: testYear,
        label: `${label} ${testYear}`,
        profit: profitM,
        // ทุนติดลบ/ศูนย์หารไม่ได้ ⇒ ถอยไปเทียบทุนเริ่มต้นแทน (กติกาเดียวกับ Python)
        pct: eqStart > 0 ? (profitM / eqStart) * 100 : capital ? (profitM / capital) * 100 : 0,
        equityStart: eqStart,
        idxStart: idxStart + x0,
        idxEnd: idxStart + x1,
        maxDd: drawdownInSpan(equity, idxStart + x0, idxStart + x1),
      };
      monthly.push(row);
      fromMonths.push(row);
    }

    totalWins += picked.wins;
    totalDays += picked.actualDays;
    const [worstLabel, worstDd] = worstMonthOf(fromMonths);
    folds.push({
      year: testYear,
      trainYears,
      nBet: size,
      profit: Math.trunc(picked.profit),
      roiPct: base > 0 ? (picked.profit / base) * 100 : 0,
      wins: picked.wins,
      actualDays: picked.actualDays,
      winRate: picked.winRate,
      maxDrawdown: Math.trunc(Math.min(0, ...pnlCurve)),
      idxStart,
      idxEnd,
      worstMonth: worstLabel,
      worstMonthDd: worstDd,
    });
  }

  return {
    capital,
    equityCurve: equity,
    totalProfit: equity[equity.length - 1] - capital,
    wins: totalWins,
    actualDays: totalDays,
    winRate: totalDays > 0 ? (totalWins / totalDays) * 100 : 0,
    maxDrawdown: Math.trunc(Math.min(0, Math.min(...equity) - capital)),
    folds,
    monthly,
    warnings,
  };
}
