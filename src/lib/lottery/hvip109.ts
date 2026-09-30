/** Literal HVIP-TM109-H60-D20-v1.0. All selections precede their target month. */
import type { MonthEntry } from './month-window';
import { computeRiskMetrics } from './engine';
import { monthDate, monthSerial } from './tb9-fixed';
const DAY = 86400000;
const numbers = Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0'));
export type History = { draws: Map<string, string>; noDraw: Set<string> };
export function hvipHistory(entries: MonthEntry[]): History {
  const draws = new Map<string, string>(), noDraw = new Set<string>(), seen = new Set<string>();
  for (const e of entries) {
    if (e.digits !== 2 || !e.is_date_sorted || !/^\d{2}$/.test(e.year) || seen.has(e.year)) throw new Error('ข้อมูลต้องเป็น 2 ตัว เรียงตามปฏิทิน และไม่มีปีซ้ำ');
    seen.add(e.year);
    const year = Number(e.year) + 1957, start = Date.UTC(year, 0, 1);
    if (e.sequence.length % 2 || e.sequence.length > (Date.UTC(year + 1, 0, 1) - start) / DAY * 2) throw new Error('ความยาวข้อมูลไม่ตรงปฏิทิน');
    for (let i = 0; i < e.sequence.length; i += 2) {
      const date = new Date(start + i / 2 * DAY).toISOString().slice(0, 10), n = e.sequence.slice(i, i + 2);
      if (/^\d{2}$/.test(n)) draws.set(date, n);
      else if (n.toLowerCase() === 'xx') noDraw.add(date);
      else if (n !== '--') throw new Error(`ผลผิดรูปแบบ ${date}`);
      // -- means unknown, never confirmed cancellation. Never pad missing years/days.
    }
  }
  return { draws, noDraw };
}
export function selectHvip109(history: History, month: string, strict = true) {
  const serial = monthSerial(month), end = `${month}-01`, start10 = `${monthDate(serial - 10)}-01`, start9 = `${monthDate(serial - 9)}-01`;
  const start60 = new Date(Date.parse(end) - 60 * DAY).toISOString().slice(0, 10);
  const missing: string[] = [];
  for (let t = Date.parse(start10); t < Date.parse(end); t += DAY) {
    const d = new Date(t).toISOString().slice(0, 10);
    if (!history.draws.has(d) && !history.noDraw.has(d)) missing.push(d);
    if (history.draws.has(d) && history.noDraw.has(d)) throw new Error(`วันมีทั้งผลและสถานะงด ${d}`);
  }
  if (strict && missing.length) throw new Error(`ประวัติไม่ยืนยัน ${missing.length} วัน`);
  const train10 = [...history.draws].filter(([d]) => start10 <= d && d < end);
  const train9 = train10.filter(([d]) => d >= start9), last60 = train10.filter(([d]) => d >= start60);
  if (!train10.length || !train9.length) throw new Error('ไม่มีผลในช่วงฝึก');
  // Observed-only experiments still need data in every one of the ten training months.
  if (!strict) for (let id = serial - 10; id < serial; id++) if (!train10.some(([d]) => d.startsWith(monthDate(id)))) throw new Error('มีเดือนฝึกไม่มีผลหวย');
  const counts = (rows: [string, string][]) => { const c = Array<number>(100).fill(0); rows.forEach(([, n]) => c[Number(n)]++); return c; };
  const c10 = counts(train10), c9 = counts(train9), c60 = counts(last60);
  const rank = (c: number[]) => [...numbers].sort((a, b) => c[Number(b)] - c[Number(a)] || Number(a) - Number(b));
  const top = rank(c10).slice(0, 34), mid = rank(c9).slice(34, 67), union = [...new Set([...top, ...mid])].sort();
  const hotRemoved = union.filter(n => c60[Number(n)] >= 4), afterHot = union.filter(n => c60[Number(n)] < 4);
  const tens = Array<number>(10).fill(0), units = Array<number>(10).fill(0);
  train10.forEach(([, n]) => { tens[Number(n[0])]++; units[Number(n[1])]++; });
  const score = (n: string) => (tens[Number(n[0])] + 1) * (units[Number(n[1])] + 1);
  const ranked = [...afterHot].sort((a, b) => score(b) - score(a) || Number(a) - Number(b));
  const keep = ranked.length - Math.floor(ranked.length / 5);
  return { month, cutoff: new Date(Date.parse(end) - DAY).toISOString().slice(0, 10), start10, start9, start60,
    top, mid, union, hotRemoved, afterHot, digitRemoved: ranked.slice(keep).sort(), candidates: ranked.slice(0, keep).sort(), missing,
    drawCounts: [train10.length, train9.length, last60.length],
    audit: numbers.map(n => ({ number: n, frequency10: c10[Number(n)], frequency9: c9[Number(n)], frequency60: c60[Number(n)], score: score(n) })) };
}
export type HvipSelection = ReturnType<typeof selectHvip109>;
export function analyzeHvip109(entries: MonthEntry[], bet = 1, payout = 100, strict = false, from = '', to = '') {
  if (!Number.isFinite(bet) || bet <= 0 || !Number.isFinite(payout) || payout <= 0) throw new Error('เงินแทงและเรตจ่ายต้องมากกว่า 0');
  const history = hvipHistory(entries), dates = [...history.draws.keys()].sort();
  if (!dates.length) throw new Error('ไม่มีผลหวย');
  const first = monthSerial(dates[0].slice(0, 7)), last = monthSerial(dates.at(-1)!.slice(0, 7));
  const start = from ? Math.max(first, monthSerial(from)) : first;
  const end = to ? Math.min(last, monthSerial(to)) : last;
  const months: { selection: HvipSelection; draws: number; wins: number; cost: number; profit: number; baseProfit: number; randomProfit: number; partial: boolean; unobserved: number }[] = [];
  const skipped: { month: string; reason: string }[] = [], equity = [0];
  let peak = 0, maxDD = 0;
  for (let id = start; id <= end; id++) {
    const month = monthDate(id), test = dates.filter(d => d.startsWith(month));
    try {
      if (!test.length) throw new Error('เดือนทดสอบไม่มีผล');
      const selection = selectHvip109(history, month, strict);
      const n = selection.candidates.length;
      if (!n) throw new Error('ไม่มีเลขเหลือหลังคัด');
      let wins = 0, baseWins = 0;
      for (const date of test) {
        const v = history.draws.get(date)!;
        const won = selection.candidates.includes(v); if (won) wins++;
        if (selection.union.includes(v)) baseWins++;
        const value = equity.at(-1)! + bet * ((won ? payout : 0) - n);
        equity.push(value); peak = Math.max(peak, value); maxDD = Math.min(maxDD, value - peak);
      }
      const monthEnd = Date.UTC(Math.floor(id / 12), id % 12 + 1, 1);
      const observedEnd = Math.min(monthEnd, Date.parse(dates.at(-1)!) + DAY);
      let unobserved = 0;
      for (let t = Date.parse(`${month}-01`); t < observedEnd; t += DAY) { const d = new Date(t).toISOString().slice(0, 10); if (!history.draws.has(d) && !history.noDraw.has(d)) unobserved++; }
      const cost = test.length * n * bet;
      months.push({ selection, draws: test.length, wins, cost, profit: bet * payout * wins - cost,
        baseProfit: bet * (payout * baseWins - test.length * selection.union.length),
        randomProfit: cost * (payout / 100 - 1), partial: observedEnd < monthEnd, unobserved });
    } catch (e) { skipped.push({ month, reason: e instanceof Error ? e.message : String(e) }); }
  }
  const sum = (k: 'draws' | 'wins' | 'cost' | 'profit' | 'baseProfit' | 'randomProfit') => months.reduce((s, m) => s + m[k], 0);
  const cost = sum('cost'), profit = sum('profit');
  return { version: 'HVIP-TM109-H60-D20-v1.0', bet, payout, from, to, strict, asOf: dates.at(-1)!, months, skipped, draws: sum('draws'), wins: sum('wins'), cost, profit,
    roi: cost ? profit / cost * 100 : 0, baseProfit: sum('baseProfit'), randomProfit: sum('randomProfit'), maxDD, risk: computeRiskMetrics(equity) };
}
export type HvipReport = ReturnType<typeof analyzeHvip109>;
