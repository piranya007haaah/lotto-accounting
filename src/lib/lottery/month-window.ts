/** Monthly walk-forward: select formula/window on prior validation months only.
 * The target month is never used to choose formula, window, numbers or size.
 * Dates are UTC calendar offsets; holidays keep their original slots.
 */
import { computeRiskMetrics, equityCurve, rankSeries, realDraws, runAllSizes, type BacktestParams } from "./engine";
import { FORMULAS, FORMULA_NAMES } from "./formulas";

export interface MonthEntry {
  year: string;
  sequence: string;
  digits: number;
  is_date_sorted: boolean;
}
export interface CalendarMonth { id: number; sequence: string; days: number }
export interface MonthScore {
  month: number;
  formula: string;
  trainStart: number;
  trainEnd: number;
  trainDays: number;
  nBet: number;
  numbers: string[];
  profit: number;
  turnover: number;
  roiPct: number;
  wins: number;
  days: number;
  equity: number[];
}
export interface FormulaWindow {
  formula: string;
  profit: number;
  roiPct: number;
  days: number;
  turnover: number;
  folds: MonthScore[];
}
export interface WindowRow {
  months: number;
  best: FormulaWindow;
  formulas: FormulaWindow[];
  test: MonthScore;
  tests: Record<string, MonthScore>;
}
export interface WindowAnalysis {
  rows: WindowRow[];
  bestMonths: number;
  maxMonths: number;
  validationStart: number;
  validationEnd: number;
  testMonth: number;
  asOf: string;
}
export interface WindowOptions extends BacktestParams {
  entries: MonthEntry[];
  testMonth: number;
  validationMonths: number;
  formula: string; // "all" searches the registry; otherwise compare a single formula.
}
const DAY = 86_400_000;
export function monthLabel(id: number): string {
  return `${["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][id % 12]} ${Math.floor(id / 12) + 543}`;
}
export function monthCalendar(entries: readonly MonthEntry[]): CalendarMonth[] {
  const months: CalendarMonth[] = [];
  const seen = new Set<number>();
  for (const entry of entries) {
    if (entry.digits !== 2) throw new Error("การเทียบกรอบเดือนนี้รองรับหวย 2 ตัวเท่านั้น");
    if (!entry.is_date_sorted) throw new Error(`ข้อมูลปี ${entry.year} ไม่ได้เรียงตามวันที่ จึงแบ่งเดือนอย่างถูกต้องไม่ได้`);
    if (!/^\d{2}$/.test(entry.year)) throw new Error("รูปแบบปีไม่รองรับ ต้องเป็น พ.ศ. 2 หลัก");
    const year = 2500 + Number(entry.year) - 543;
    if (seen.has(year)) throw new Error("พบข้อมูลปีซ้ำในหวย/ตำแหน่งเดียวกัน");
    seen.add(year);
    const yearStart = Date.UTC(year, 0, 1);
    const yearDays = (Date.UTC(year + 1, 0, 1) - yearStart) / DAY;
    if (entry.sequence.length % 2 || entry.sequence.length > yearDays * 2) throw new Error(`ความยาวข้อมูลปี ${entry.year} ไม่ตรงกับปฏิทิน`);
    for (let m = 0; m < 12; m++) {
      const from = (Date.UTC(year, m, 1) - yearStart) / DAY;
      const to = (Date.UTC(year, m + 1, 1) - yearStart) / DAY;
      // Extract by calendar offset BEFORE skipping holidays. Never infer dates from draw count.
      const sequence = entry.sequence.slice(from * 2, to * 2).padEnd((to - from) * 2, "-");
      months.push({ id: year * 12 + m, sequence, days: realDraws(sequence).length });
    }
  }
  return months.sort((a, b) => a.id - b.id);
}

/** Same profit and smaller-size tie break as runAllSizes(train, train), in O(draws+99).
 * Only profit is needed here; calculating all 99 equity curves would block large searches.
 */
function trainSize(numbers: string[], train: string, params: BacktestParams): number {
  const ranks = rankSeries(numbers, train, 99);
  const counts = new Array<number>(100).fill(0);
  for (const rank of ranks) counts[rank]++;
  let wins = 0, bestProfit = -Infinity, bestSize = 1;
  for (let n = 1; n <= 99; n++) {
    wins += counts[n - 1];
    const profit = params.betPerNumber * (params.payoutRate * wins - n * ranks.length);
    if (profit > bestProfit) { bestProfit = profit; bestSize = n; }
  }
  return bestSize;
}
function scoreMonth(month: CalendarMonth, train: string, formula: string, params: BacktestParams, trainStart: number): MonthScore {
  const numbers = FORMULAS[formula](train);
  const nBet = trainSize(numbers, train, params);
  const ranks = rankSeries(numbers, month.sequence, 99);
  const equity = equityCurve(ranks, nBet, params);
  const profit = equity[equity.length - 1] - params.capital;
  const turnover = nBet * params.betPerNumber * ranks.length;
  return { month: month.id, formula, trainStart, trainEnd: month.id - 1, trainDays: realDraws(train).length, nBet, numbers: numbers.slice(0, nBet), profit, turnover,
    roiPct: turnover ? profit / turnover * 100 : 0, wins: ranks.filter((rank) => rank < nBet).length,
    days: ranks.length, equity };
}
export function analyzeMonthWindows(options: WindowOptions): WindowAnalysis {
  const { testMonth, validationMonths } = options;
  if (!Number.isInteger(testMonth) || !Number.isInteger(validationMonths) || validationMonths < 1 || validationMonths > 12) throw new Error("เดือนทดสอบหรือจำนวนเดือนคัดเลือกไม่ถูกต้อง");
  if (![options.capital, options.betPerNumber, options.payoutRate].every(Number.isFinite) || options.capital < 0 || options.betPerNumber <= 0 || options.payoutRate <= 0) throw new Error("ทุน เงินแทง และเรตจ่ายไม่ถูกต้อง");
  const names = options.formula === "all" ? FORMULA_NAMES : FORMULA_NAMES.filter((name) => name === options.formula);
  if (!names.length) throw new Error("ไม่พบสูตรที่เลือก");
  // Ignore future years entirely, including their metadata. Future data cannot affect selection.
  const calendar = monthCalendar(options.entries.filter((entry) => Number(entry.year) + 1957 <= Math.floor(testMonth / 12)));
  const byMonth = new Map(calendar.map((month) => [month.id, month]));
  const first = calendar.find((month) => month.days > 0)?.id;
  const target = byMonth.get(testMonth);
  if (first == null || !target?.days) throw new Error("เดือนทดสอบนี้ยังไม่มีผลหวย");
  const validationStart = testMonth - validationMonths;
  const maxMonths = validationStart - first;
  if (maxMonths < 1) throw new Error("ข้อมูลยังไม่พอ: ต้องมีเดือนฝึกอย่างน้อย 1 เดือน ตามด้วยเดือนคัดเลือกและเดือนทดสอบ ลองลดจำนวนเดือนคัดเลือกหรือเลือกเดือนทดสอบที่ใหม่ขึ้น");
  const validation = Array.from({ length: validationMonths }, (_, i) => byMonth.get(validationStart + i));
  if (validation.some((month) => !month)) throw new Error("ข้อมูลปีในช่วงคัดเลือกขาดหาย ไม่สามารถเทียบด้วยช่วงเดียวกันได้");
  if (!validation.some((month) => month!.days > 0)) throw new Error("ช่วงคัดเลือกไม่มีงวดจริง");
  function training(end: number, count: number): string | null {
    const parts: string[] = [];
    for (let id = end - count; id < end; id++) {
      const part = byMonth.get(id);
      if (!part) return null; // An absent year is not silently treated as a holiday.
      parts.push(part.sequence);
    }
    const joined = parts.join("");
    return realDraws(joined).length ? joined : null;
  }
  const rows: WindowRow[] = [];
  for (let months = 1; months <= maxMonths; months++) {
    const trains = validation.map((month) => training(month!.id, months));
    const targetTrain = training(testMonth, months);
    if (trains.some((train) => train === null) || targetTrain === null) continue;
    const formulas = names.map((formula): FormulaWindow => {
      const folds = validation.map((month, index) => scoreMonth(month!, trains[index]!, formula, options, month!.id - months));
      const profit = folds.reduce((sum, fold) => sum + fold.profit, 0);
      const turnover = folds.reduce((sum, fold) => sum + fold.turnover, 0);
      return { formula, profit, turnover, roiPct: turnover ? profit / turnover * 100 : 0,
        days: folds.reduce((sum, fold) => sum + fold.days, 0), folds };
    }).sort((a, b) => b.profit - a.profit || FORMULA_NAMES.indexOf(a.formula) - FORMULA_NAMES.indexOf(b.formula));
    const best = formulas[0];
    const tests = Object.fromEntries(names.map((name) => [name, scoreMonth(target, targetTrain, name, options, testMonth - months)]));
    rows.push({ months, best, formulas, test: tests[best.formula], tests });
  }
  if (!rows.length) throw new Error("ไม่มีกรอบที่มีข้อมูลฝึกครบทุกเดือนคัดเลือกและเดือนทดสอบ");
  const best = [...rows].sort((a, b) => b.best.profit - a.best.profit || a.months - b.months)[0];
  let lastDay = 0;
  for (let day = 0; day < target.sequence.length / 2; day++) {
    if (/^\d{2}$/.test(target.sequence.slice(day * 2, day * 2 + 2))) lastDay = day + 1;
  }
  return { rows, bestMonths: best.months, maxMonths, validationStart, validationEnd: testMonth - 1,
    testMonth, asOf: `${lastDay} ${monthLabel(testMonth)}` };
}
export function testRisk(test: MonthScore) {
  return { ...computeRiskMetrics(test.equity), maxDrawdown: Math.min(0, ...test.equity.map((v) => v - test.equity[0])) };
}


export interface DrawDetail {
  date: string;
  day: number;
  result: string | null;
  rank: number | null;
  won: boolean | null;
  cost: number;
  prize: number;
  profit: number;
  cumulative: number;
  equity: number;
}
/** Build detailed evidence only for the month opened, avoiding huge worker payloads.
 * Training choices come from the same engine. Daily rows preserve calendar days.
 */
export function inspectMonthScore(score: MonthScore, entries: MonthEntry[], params: BacktestParams) {
  const calendar = monthCalendar(entries.filter((entry) => Number(entry.year) + 1957 <= Math.floor(score.month / 12)));
  const trainMonths = calendar.filter((month) => month.id >= score.trainStart && month.id <= score.trainEnd);
  const trainStr = trainMonths.map((month) => month.sequence).join("");
  const numbers = FORMULAS[score.formula](trainStr);
  const sizeChoices = runAllSizes({ ...params, testStr: trainStr, sortedNums: numbers }).results;
  const target = calendar.find((month) => month.id === score.month);
  if (!target) throw new Error("ไม่พบผลเดือนที่เปิดดู");
  const selected = new Set(score.numbers);
  const counts = new Map<string, number>();
  for (const num of realDraws(trainStr)) counts.set(num, (counts.get(num) ?? 0) + 1);
  let cumulative = 0;
  const draws: DrawDetail[] = [];
  for (let day = 1; day <= target.sequence.length / 2; day++) {
    const raw = target.sequence.slice((day - 1) * 2, day * 2);
    const result = /^\d{2}$/.test(raw) ? raw : null;
    const won = result === null ? null : selected.has(result);
    const cost = result === null ? 0 : score.nBet * params.betPerNumber;
    const prize = won ? params.betPerNumber * params.payoutRate : 0;
    const profit = prize - cost;
    cumulative += profit;
    draws.push({ date: `${Math.floor(score.month / 12)}-${String(score.month % 12 + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day, result, rank: result === null ? null : numbers.indexOf(result) + 1, won,
      cost, prize, profit, cumulative, equity: params.capital + cumulative });
  }
  return { draws, trainMonths, sizeChoices,
    numberRanks: numbers.map((number, i) => ({ number, rank: i + 1, count: counts.get(number) ?? 0, selected: i < score.nBet })) };
}
