/** Literal MIX7/6-MID30 and MIX6/5-MID30 v1.0 from the supplied Python.
 * Select ranks 31–60 before each calendar month, then hold all 30 numbers.
 */
import { hvipHistory, type History } from './hvip109';
import { computeRiskMetrics } from './engine';
import { monthDate, monthSerial } from './tb9-fixed';
import type { MonthEntry } from './month-window';

export const MID30_FORMULAS = {
  phupha76: { name: 'ลาวภูผา76', original: 'MIX7/6-MID30', frequencyMonths: 7, digitMonths: 6 },
  saithan65: { name: 'ลาวสายธาร65', original: 'MIX6/5-MID30', frequencyMonths: 6, digitMonths: 5 },
} as const;
export type Mid30Formula = keyof typeof MID30_FORMULAS;
export function isMid30Formula(formula: string): formula is Mid30Formula {
  return Object.hasOwn(MID30_FORMULAS, formula);
}
const DAY = 86400000;

export function selectMid30(history: History, month: string, formula: Mid30Formula, strict = true) {
  const spec = MID30_FORMULAS[formula];
  if (!spec) throw new Error('ไม่พบสูตร MID30');
  const serial = monthSerial(month), end = `${month}-01`;
  const frequencyStart = `${monthDate(serial - spec.frequencyMonths)}-01`;
  const digitStart = `${monthDate(serial - spec.digitMonths)}-01`;
  const cutoff = new Date(Date.parse(end) - DAY).toISOString().slice(0, 10);
  const missing: string[] = [];
  for (let t = Date.parse(frequencyStart); t < Date.parse(end); t += DAY) {
    const day = new Date(t).toISOString().slice(0, 10);
    if (history.draws.has(day) && history.noDraw.has(day)) throw new Error(`วันมีทั้งผลและสถานะงด ${day}`);
    if (!history.draws.has(day) && !history.noDraw.has(day)) missing.push(day);
  }
  if (strict && missing.length) throw new Error(`ประวัติไม่ยืนยัน ${missing.length} วัน ตั้งแต่ ${frequencyStart} ถึง ${cutoff}`);
  const pairValues = [...history.draws].filter(([day]) => frequencyStart <= day && day < end);
  const digitValues = pairValues.filter(([day]) => day >= digitStart);
  if (!pairValues.length || !digitValues.length) throw new Error('ไม่มีผลในกรอบย้อนหลังที่ต้องใช้');
  // A clearly labelled extension for incomplete datasets, never the certified original.
  if (!strict) for (let id = serial - spec.frequencyMonths; id < serial; id++) {
    if (!pairValues.some(([day]) => day.startsWith(monthDate(id)))) throw new Error(`เดือนฝึก ${monthDate(id)} ไม่มีผลหวย`);
  }
  const pairs = Array<number>(100).fill(0), tens = Array<number>(10).fill(0), units = Array<number>(10).fill(0);
  pairValues.forEach(([, value]) => pairs[Number(value)]++);
  digitValues.forEach(([, value]) => { tens[Number(value[0])]++; units[Number(value[1])]++; });
  const nf = pairValues.length, nd = digitValues.length;
  const denominator = 2 * (nf + 100) * (nd + 10) ** 2;
  // Integer numerators preserve exact ordering and numeric tie breaks as Python.
  const numerators = pairs.map((c, n) => (c + 1) * (nd + 10) ** 2 + (tens[Math.floor(n / 10)] + 1) * (units[n % 10] + 1) * (nf + 100));
  const ranked = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => numerators[b] - numerators[a] || a - b);
  const number = (n: number) => String(n).padStart(2, '0');
  const selected = ranked.slice(30, 60).map(number);
  return {
    name: spec.name, formula: spec.original, version: '1.0', target_month: month, cutoff,
    frequency_window: [frequencyStart, cutoff], digit_window: [digitStart, cutoff],
    frequency_draws: nf, digit_draws: nd, frequency_weight: 0.5, digit_weight: 0.5,
    selected_ranks: [31, 60], candidate_count: selected.length, candidates: [...selected].sort(), candidates_in_rank_order: selected,
    all_ranks: ranked.map((n, i) => ({ rank: i + 1, number: number(n), pair_count: pairs[n], tens_count: tens[Math.floor(n / 10)], units_count: units[n % 10], score_numerator: numerators[n], score_denominator: denominator, score: numerators[n] / denominator, selected: i >= 30 && i < 60 })),
    strict, missing,
  };
}
export type Mid30Selection = ReturnType<typeof selectMid30>;
export type Mid30Month = {
  selection: Mid30Selection;
  draws: { date: string; value: string; won: boolean; profit: number; cumulative: number }[];
  wins: number; cost: number; profit: number; unobserved: number; partial: boolean;
};
export function analyzeMid30(entries: MonthEntry[], formula: Mid30Formula, year: number, bet: number, payout: number, strict = true) {
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isFinite(bet) || bet <= 0 || bet > 1e6 || !Number.isFinite(payout) || payout <= 0 || payout > 10000) throw new Error('ปี เงินแทง หรือเรตจ่ายไม่ถูกต้อง');
  // Filter future years before validation so future data cannot affect this run.
  const history = hvipHistory(entries.filter(e => Number(e.year) + 1957 <= year));
  const dates = [...history.draws.keys()].sort(), asOf = dates.at(-1);
  if (!asOf) throw new Error('ไม่มีผลหวย');
  const months: Mid30Month[] = [], skipped: string[] = [], curve = [0];
  for (let m = 0; m < 12; m++) {
    const target = monthDate(year * 12 + m);
    if (`${target}-01` > asOf) break;
    try {
      const test = dates.filter(day => day.startsWith(target + '-'));
      if (!test.length) throw new Error('เดือนทดสอบไม่มีผล');
      const selection = selectMid30(history, target, formula, strict), picked = new Set(selection.candidates);
      let cumulative = 0;
      const draws = test.map(date => {
        const value = history.draws.get(date)!, won = picked.has(value);
        const profit = bet * ((won ? payout : 0) - picked.size);
        cumulative += profit; curve.push(curve.at(-1)! + profit);
        return { date, value, won, profit, cumulative };
      });
      const monthEnd = Date.UTC(year, m + 1, 1), observedEnd = Math.min(monthEnd, Date.parse(asOf) + DAY);
      let unobserved = 0;
      for (let t = Date.parse(`${target}-01`); t < observedEnd; t += DAY) {
        const day = new Date(t).toISOString().slice(0, 10);
        if (!history.draws.has(day) && !history.noDraw.has(day)) unobserved++;
      }
      months.push({ selection, draws, wins: draws.filter(d => d.won).length, cost: draws.length * picked.size * bet, profit: cumulative, unobserved, partial: observedEnd < monthEnd });
    } catch (e) { skipped.push(`${target}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const cost = months.reduce((s, m) => s + m.cost, 0), profit = curve.at(-1)!, risk = computeRiskMetrics(curve);
  return { months, summary: { months: months.length, draws: months.reduce((s, m) => s + m.draws.length, 0), wins: months.reduce((s, m) => s + m.wins, 0), cost, profit, roi: cost ? profit / cost * 100 : 0, maxDD: Math.min(0, ...curve), lossStreak: risk.maxLossStreak, lossAmount: risk.maxLossStreakAmount, asOf, skipped } };
}
