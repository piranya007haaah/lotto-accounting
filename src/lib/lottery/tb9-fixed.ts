import { monthCalendar, type MonthEntry } from "./month-window";

export const HISTORY_START = "2023-01-01";
// Only cancellations explicitly confirmed in the supplied TB9-Fixed specification.
export const CANCELED = new Set(["2023-02-16", "2023-02-17", "2023-02-18", "2023-02-19", "2023-02-20", "2023-02-21", "2023-02-26", "2025-01-07"]);
export type Draw = { date: string; top2: string };
export type Audit = { number: string; count: number; rank: number; group: "top" | "mid" | "bottom"; p: number; threshold: number; gap: number; last_date: string | null; gap_is_lower_bound: boolean; reason: "top_all" | "bottom_gap" | "mid_fill" | null };
export function monthDate(serial: number) { return `${Math.floor(serial / 12)}-${String(serial % 12 + 1).padStart(2, "0")}`; }
export function monthSerial(month: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("เดือนต้องเป็น ค.ศ. YYYY-MM");
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1;
}
export function datasetDraws(entries: MonthEntry[]): Draw[] {
  const rows: Draw[] = [];
  for (const m of monthCalendar(entries)) for (let i = 0; i < m.sequence.length; i += 2) {
    const date = `${monthDate(m.id)}-${String(i / 2 + 1).padStart(2, "0")}`;
    const top2 = m.sequence.slice(i, i + 2);
    if (date < HISTORY_START) continue;
    if (/^[0-9]{2}$/.test(top2)) rows.push({ date, top2 });
    else if (top2 !== "--") throw new Error(`ผลผิดรูปแบบ ${date}: ${top2}`);
  }
  return rows;
}
export function checkTop3(rows: Draw[], entries: MonthEntry[]) {
  const top2 = new Map(rows.map((r) => [r.date, r.top2]));
  let checked = 0;
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.digits !== 3 || !entry.is_date_sorted || !/^\d{2}$/.test(entry.year) || seen.has(entry.year)) throw new Error("ข้อมูลสามบนไม่อยู่ในรูปปฏิทินที่ตรวจได้");
    seen.add(entry.year);
    const year = 2500 + Number(entry.year) - 543;
    const yearDays = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000;
    if (entry.sequence.length % 3 || entry.sequence.length > yearDays * 3) throw new Error("ความยาวข้อมูลสามบนไม่ตรงปฏิทิน");
    for (let i = 0; i < entry.sequence.length; i += 3) {
      const date = new Date(Date.UTC(year, 0, i / 3 + 1)).toISOString().slice(0, 10), n = entry.sequence.slice(i, i + 3);
      if (date < HISTORY_START || n === "---") continue;
      if (!/^[0-9]{3}$/.test(n)) throw new Error(`สามบนผิดรูปแบบ ${date}`);
      if (top2.has(date)) { if (top2.get(date) !== n.slice(-2)) throw new Error(`สองบนไม่ตรงท้ายสามบน ${date}`); checked++; }
    }
  }
  return checked;
}
export function missingDates(rows: Draw[], endExclusive: string) {
  const dates = new Set(rows.map((r) => r.date));
  const missing: string[] = [];
  for (let t = Date.parse(HISTORY_START); t < Date.parse(endExclusive); t += 86400000) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!dates.has(date) && !CANCELED.has(date)) missing.push(date);
  }
  return missing;
}
export function tb9Fixed(rows: Draw[], targetMonth: string) {
  const serial = monthSerial(targetMonth), start = `${targetMonth}-01`, trainStart = `${monthDate(serial - 9)}-01`;
  const history = rows.filter((r) => r.date < start).sort((a, b) => a.date.localeCompare(b.date));
  if (!history.length || history[0].date > trainStart) throw new Error("ประวัติไม่พอ 9 เดือนปฏิทินเต็ม");
  if (new Set(history.map((r) => r.date)).size !== history.length) throw new Error("วันที่ออกรางวัลซ้ำ");
  for (const r of history) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0, 10) !== r.date || !/^[0-9]{2}$/.test(r.top2)) throw new Error("วันที่หรือผลสองหลักไม่ถูกต้อง");
  }
  const train = history.filter((r) => r.date >= trainStart);
  const counts = Array<number>(100).fill(0), last = new Map<string, { i: number; date: string }>();
  train.forEach((r) => counts[Number(r.top2)]++);
  history.forEach((r, i) => last.set(r.top2, { i, date: r.date }));
  const ranked = Array.from({ length: 100 }, (_, i) => i).sort((a, b) => counts[b] - counts[a] || a - b);
  const audit: Audit[] = ranked.map((n, i) => {
    const number = String(n).padStart(2, "0"), found = last.get(number), p = (counts[n] + 1) / (train.length + 100);
    return { number, count: counts[n], rank: i + 1, group: i < 34 ? "top" : i < 67 ? "mid" : "bottom", p,
      threshold: Math.ceil(Math.log(0.5) / Math.log(1 - p)), gap: found ? history.length - 1 - found.i : history.length,
      last_date: found?.date ?? null, gap_is_lower_bound: !found, reason: null };
  });
  audit.forEach((a) => { if (a.group === "top") a.reason = "top_all"; else if (a.group === "bottom" && a.gap >= a.threshold) a.reason = "bottom_gap"; });
  const fill = Math.max(0, 45 - audit.filter((a) => a.reason).length);
  audit.filter((a) => a.group === "mid").sort((a, b) => b.gap / b.threshold - a.gap / a.threshold || b.count - a.count || Number(a.number) - Number(b.number)).slice(0, fill).forEach((a) => { a.reason = "mid_fill"; });
  const candidates = audit.filter((a) => a.reason).map((a) => a.number).sort();
  return { formula_id: "TB9-Fixed", formula_version: "1.0", target_month: targetMonth, training_start: trainStart,
    training_end_exclusive: start, training_draws: train.length, history_start: history[0].date,
    candidates, candidate_count: candidates.length, audit };
}
export type Selection = ReturnType<typeof tb9Fixed>;
export function verifiedSelection(rows: Draw[], month: string) {
  const relevant = rows.filter((r) => r.date < `${month}-01`);
  const conflict = relevant.find((r) => CANCELED.has(r.date));
  if (conflict) throw new Error(`มีผลในวันงดที่ยืนยัน ${conflict.date} ต้องตรวจแหล่งข้อมูลก่อน`);
  const missing = missingDates(relevant, `${month}-01`);
  if (missing.length) throw new Error(`ประวัติยังไม่ครบ: ขาด ${missing.length} วัน (${missing.slice(0, 5).join(", ")}) ไม่ถือเป็นวันงด`);
  return tb9Fixed(relevant, month);
}
export function evaluateMonth(selection: Selection, rows: Draw[], bet = 1) {
  if (!Number.isFinite(bet) || bet <= 0 || bet > 1e6) throw new Error("เงินแทงต้องมากกว่า 0 และไม่เกิน 1,000,000");
  let cumulative = 0;
  const draws = rows.filter((r) => r.date.startsWith(selection.target_month + "-")).sort((a, b) => a.date.localeCompare(b.date)).map((r) => {
    const won = selection.candidates.includes(r.top2), profit = bet * ((won ? 100 : 0) - selection.candidate_count);
    cumulative += profit;
    return { ...r, won, profit, cumulative };
  });
  const wins = draws.filter((r) => r.won).length, cost = draws.length * selection.candidate_count * bet, received = wins * 100 * bet;
  return { draws, wins, cost, received, profit: received - cost, roi: cost ? (received - cost) / cost * 100 : 0 };
}
export function canonicalSource(rows: Draw[], month: string) {
  return JSON.stringify({ history_start: HISTORY_START, canceled: [...CANCELED].filter((d) => d < `${month}-01`).sort(), rows: rows.filter((r) => r.date < `${month}-01`).sort((a, b) => a.date.localeCompare(b.date)).map((r) => [r.date, r.top2]) });
}
