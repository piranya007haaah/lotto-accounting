import { analyzeTmb, type TmbReport } from './tmb-experiment';
import { tb9Fixed, CANCELED, HISTORY_START, monthDate, type Selection, type Draw } from './tb9-fixed';
import { computeRiskMetrics } from './engine';
import { monthCalendar, type MonthEntry } from './month-window';
export type LabFormula = 'TMB' | 'TB9';
export type LabGroup = { lottery: string; position: string };
export type LabOptions = { formula: LabFormula; year: number; bet: number; payout: number; strict: boolean };
export type Tb9Month = { selection: Selection; draws: (Draw & { won: boolean; profit: number; cumulative: number })[]; wins: number; cost: number; profit: number; unobserved: number; partial: boolean };
export type LabSummary = { months: number; draws: number; wins: number; cost: number; profit: number; roi: number; maxDD: number; lossStreak: number; lossAmount: number; asOf: string; skipped: string[]; baseProfit?: number };
export type LabReport = { summary: LabSummary; tmb?: TmbReport; tb9?: Tb9Month[] };
export const labKey = (g: LabGroup) => JSON.stringify([g.lottery, g.position]);
export function analyzeLabGroup(entries: MonthEntry[], group: LabGroup, options: LabOptions): LabReport {
  const { formula, year, bet, payout, strict } = options;
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isFinite(bet) || bet <= 0 || bet > 1e6 || !Number.isFinite(payout) || payout <= 0 || payout > 10000) throw new Error('ปี เงินแทง หรือเรตจ่ายไม่ถูกต้อง');
  if (formula === 'TMB') {
    const tmb = analyzeTmb({ entries, year, bet, payout });
    return { tmb, summary: { months: tmb.months.length, draws: tmb.days, wins: tmb.wins, cost: tmb.cost, profit: tmb.profit, roi: tmb.roi, maxDD: tmb.maxDD, lossStreak: tmb.lossStreak, lossAmount: tmb.lossAmount, asOf: tmb.asOf, skipped: tmb.skipped, baseProfit: tmb.baseProfit } };
  }
  // Keep the original 2023 history origin and nine-calendar-month rule. Cancellations
  // in the supplied Lao Star document have no authority for any other group.
  const cal = monthCalendar(entries.filter(e => Number(e.year) + 1957 <= year));
  const raw = new Map<string, string>(), rows: Draw[] = [];
  for (const m of cal) for (let i = 0; i < m.sequence.length; i += 2) {
    const date = `${monthDate(m.id)}-${String(i / 2 + 1).padStart(2, '0')}`, value = m.sequence.slice(i, i + 2);
    if (date < HISTORY_START) continue;
    if (!/^\d{2}$/.test(value) && value !== '--' && value.toLowerCase() !== 'xx') throw new Error(`ผลผิดรูปแบบ ${date}: ${value}`);
    raw.set(date, value);
    if (/^\d{2}$/.test(value)) rows.push({ date, top2: value });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const asOf = rows.at(-1)?.date;
  if (!asOf) throw new Error('ไม่มีผลหวยตั้งแต่ 2023-01-01');
  const byMonth = new Map(cal.map(m => [m.id, m]));
  const laoUpper = /^(หวย)?ลาวสตาร์$/.test(group.lottery) && group.position === 'สองบน';
  const tb9: Tb9Month[] = [], skipped: string[] = [], curve = [0];
  for (let m = 0; m < 12; m++) {
    const target = monthDate(year * 12 + m);
    if (`${target}-01` > asOf) break;
    try {
      if (!byMonth.get(year * 12 + m)?.days) throw new Error('เดือนทดสอบไม่มีผล');
      for (let i = 1; i <= 9; i++) if (!byMonth.get(year * 12 + m - i)?.days) throw new Error('ต้องมีผลในทุกเดือนฝึกย้อนหลัง 9 เดือน');
      if (strict) for (let t = Date.parse(HISTORY_START); t < Date.parse(`${target}-01`); t += 86400000) {
        const date = new Date(t).toISOString().slice(0, 10), value = raw.get(date);
        const canceled = value?.toLowerCase() === 'xx' || (laoUpper && CANCELED.has(date));
        if (canceled && value && /^\d{2}$/.test(value)) throw new Error(`มีผลในวันงด ${date}`);
        if (!canceled && (!value || !/^\d{2}$/.test(value))) throw new Error(`ประวัติไม่ยืนยันวัน ${date}`);
      }
      const selection = tb9Fixed(rows, target), picked = new Set(selection.candidates);
      let cumulative = 0;
      const draws = rows.filter(r => r.date.startsWith(target + '-')).map(r => {
        const won = picked.has(r.top2), profit = bet * ((won ? payout : 0) - picked.size);
        cumulative += profit; curve.push(curve[curve.length - 1] + profit);
        return { ...r, won, profit, cumulative };
      });
      const endDay = target === asOf.slice(0, 7) ? Number(asOf.slice(8)) : new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
      let unobserved = 0;
      for (let d = 1; d <= endDay; d++) {
        const date = `${target}-${String(d).padStart(2, '0')}`, value = raw.get(date);
        if (!/^\d{2}$/.test(value ?? '') && value?.toLowerCase() !== 'xx' && !(laoUpper && CANCELED.has(date))) unobserved++;
      }
      tb9.push({ selection, draws, wins: draws.filter(r => r.won).length, cost: draws.length * picked.size * bet, profit: cumulative, unobserved, partial: target === asOf.slice(0, 7) && endDay < new Date(Date.UTC(year, m + 1, 0)).getUTCDate() });
    } catch (e) { skipped.push(`${target}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const cost = tb9.reduce((s, m) => s + m.cost, 0), profit = curve[curve.length - 1], risk = computeRiskMetrics(curve);
  return { tb9, summary: { months: tb9.length, draws: tb9.reduce((s, m) => s + m.draws.length, 0), wins: tb9.reduce((s, m) => s + m.wins, 0), cost, profit, roi: cost ? profit / cost * 100 : 0, maxDD: Math.min(0, ...curve), lossStreak: risk.maxLossStreak, lossAmount: risk.maxLossStreakAmount, asOf, skipped } };
}
