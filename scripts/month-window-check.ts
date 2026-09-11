/** Regression checks: calendar indexing, exact engine parity, and holdout isolation. */
import assert from "node:assert/strict";
import { analyzeMonthWindows, inspectMonthScore, monthCalendar, type MonthEntry } from "../src/lib/lottery/month-window";
import { FORMULAS } from "../src/lib/lottery/formulas";
import { equityCurve, runAllSizes } from "../src/lib/lottery/engine";

let checks = 0;
function check(fn: () => void) { fn(); checks++; }
function entry(year: string): MonthEntry {
  const ce = Number(year) + 1957;
  const days = (Date.UTC(ce + 1, 0, 1) - Date.UTC(ce, 0, 1)) / 86400000;
  return { year, digits: 2, is_date_sorted: true,
    sequence: Array.from({ length: days }, (_, d) => d % 7 === 0 ? "--" : String((d * 13 + Math.floor(d / 31) * 7) % 100).padStart(2, "0")).join("") };
}
const entries = [entry("66"), entry("67"), entry("68"), entry("69")];
const params = { capital: 100000, betPerNumber: 100, payoutRate: 90 };
const testMonth = 2026 * 12 + 8;
const options = { entries, testMonth, validationMonths: 3, formula: "all", ...params };
const start = performance.now();
const result = analyzeMonthWindows(options);
check(() => assert.equal(result.maxMonths, 41)); // Jan 2023 through May 2026 before June validation
check(() => assert.equal(result.rows.length, 41));
const calendar = monthCalendar(entries);
check(() => assert.equal(calendar.find((m) => m.id === 2024 * 12 + 1)!.sequence.length, 58));
check(() => assert.equal(calendar.find((m) => m.id === 2023 * 12 + 1)!.sequence.length, 56));
check(() => assert.equal(calendar.find((m) => m.id === 2024 * 12 + 2)!.sequence.slice(0, 2), entries[1].sequence.slice(120, 122)));

// Replace every result from holdout onwards. Selection, validation folds, numbers and n must stay identical.
const changed = structuredClone(entries);
const cut = (Date.UTC(2026, 8, 1) - Date.UTC(2026, 0, 1)) / 86400000 * 2;
changed[3].sequence = changed[3].sequence.slice(0, cut) + "99".repeat((changed[3].sequence.length - cut) / 2);
const changedResult = analyzeMonthWindows({ ...options, entries: changed });
check(() => assert.equal(result.bestMonths, changedResult.bestMonths));
for (const [i, row] of result.rows.entries()) {
  check(() => assert.deepEqual(row.best, changedResult.rows[i].best));
  check(() => assert.deepEqual(row.test.numbers, changedResult.rows[i].test.numbers));
  check(() => assert.equal(row.test.nBet, changedResult.rows[i].test.nBet));
}
check(() => assert.notDeepEqual(result.rows.map((r) => r.test.profit), changedResult.rows.map((r) => r.test.profit)));
// Future-year metadata is irrelevant as well.
check(() => assert.deepEqual(analyzeMonthWindows({ ...options, entries: [...entries, { ...entry("70"), is_date_sorted: false }] }), result));

// Independent slow oracle uses the established engine on each fold, including cross-year windows.
for (const row of result.rows.filter((r) => [1, 3, 12, 41].includes(r.months))) {
  for (const f of row.formulas) {
    for (const fold of f.folds) {
      const trainStr = calendar.filter((m) => m.id >= fold.month - row.months && m.id < fold.month).map((m) => m.sequence).join("");
      const numbers = FORMULAS[f.formula](trainStr);
      const train = runAllSizes({ ...params, sortedNums: numbers, testStr: trainStr });
      const test = runAllSizes({ ...params, sortedNums: numbers, testStr: calendar.find((m) => m.id === fold.month)!.sequence });
      const chosen = test.results.find((r) => r.size === train.results[0].size)!;
      check(() => assert.equal(fold.nBet, chosen.size));
      check(() => assert.equal(fold.profit, chosen.profit));
      check(() => assert.deepEqual(fold.equity, equityCurve(test.ranks, chosen.size, params)));
    }
  }
}
check(() => assert.ok(result.rows.every((r) => r.best.days === result.rows[0].best.days)));
const short = analyzeMonthWindows({ ...options, formula: "ความถี่สูงสุด", validationMonths: 1 });
check(() => assert.equal(short.maxMonths, 43));
check(() => assert.ok(short.rows.every((r) => r.formulas.length === 1)));
check(() => assert.throws(() => analyzeMonthWindows({ ...options, entries: [{ ...entries[0], is_date_sorted: false }, ...entries.slice(1)] }), /เรียงตามวันที่/));
check(() => assert.throws(() => monthCalendar([{ ...entries[0], digits: 3 }]), /2 ตัว/));
check(() => assert.throws(() => monthCalendar([{ ...entries[0], sequence: "123" }]), /ความยาว/));
check(() => assert.throws(() => analyzeMonthWindows({ ...options, testMonth: 2023 * 12 + 2 }), /ข้อมูลยังไม่พอ/));
check(() => assert.throws(() => analyzeMonthWindows({ ...options, formula: "toString" }), /ไม่พบสูตร/));
check(() => assert.throws(() => analyzeMonthWindows({ ...options, betPerNumber: NaN }), /ไม่ถูกต้อง/));
const gaps = analyzeMonthWindows({ ...options, entries: entries.filter((e) => e.year !== "67") });
check(() => assert.ok(gaps.rows.every((r) => r.months <= 17)));
const empty = entries.map((e) => ({ ...e, sequence: "--".repeat(e.sequence.length / 2) }));
check(() => assert.throws(() => analyzeMonthWindows({ ...options, entries: empty }), /ยังไม่มีผลหวย/));
// Flat identical observations lead to equal profits across windows -> shortest wins deterministically.
const ties = analyzeMonthWindows({ ...options, entries: entries.map((e) => ({ ...e, sequence: "00".repeat(e.sequence.length / 2) })) });
check(() => assert.equal(ties.bestMonths, 1));
// Drill-down must reconcile to the exact parent totals for every formula, including losers.
for (const row of result.rows.filter((r) => [1, 12, 41].includes(r.months))) {
  for (const formula of row.formulas) {
    for (const score of [...formula.folds, row.tests[formula.formula]]) {
      const details = inspectMonthScore(score, entries, params);
      check(() => assert.equal(details.draws.reduce((sum, d) => sum + d.profit, 0), score.profit));
      check(() => assert.equal(details.draws.reduce((sum, d) => sum + d.cost, 0), score.turnover));
      check(() => assert.equal(details.draws.filter((d) => d.won === true).length, score.wins));
      check(() => assert.equal(details.draws.filter((d) => d.result !== null).length, score.days));
      check(() => assert.deepEqual([params.capital, ...details.draws.filter((d) => d.result !== null).map((d) => d.equity)], score.equity));
      check(() => assert.ok(details.draws.filter((d) => d.result === null).every((d) => d.cost === 0 && d.prize === 0 && d.profit === 0)));
      check(() => assert.equal(details.trainMonths.reduce((sum, m) => sum + m.days, 0), score.trainDays));
      check(() => assert.ok(details.trainMonths.every((m) => m.id < score.month)));
      check(() => assert.equal(details.sizeChoices[0].size, score.nBet));
      check(() => assert.equal(details.sizeChoices.length, 99));
      check(() => assert.equal(details.numberRanks.length, 100));
      check(() => assert.deepEqual(details.numberRanks.filter((n) => n.selected).map((n) => n.number), score.numbers));
      check(() => assert.equal(details.numberRanks.reduce((sum, n) => sum + n.count, 0), score.trainDays));
    }
    const changedRow = changedResult.rows.find((r) => r.months === row.months)!;
    check(() => assert.deepEqual(row.tests[formula.formula].numbers, changedRow.tests[formula.formula].numbers));
    check(() => assert.equal(row.tests[formula.formula].nBet, changedRow.tests[formula.formula].nBet));
  }
}
const february = analyzeMonthWindows({ ...options, testMonth: 2024 * 12 + 1 }).rows[0].test;
const febDetails = inspectMonthScore(february, entries, params);
check(() => assert.equal(febDetails.draws.at(-1)?.date, "2024-02-29"));
check(() => assert.equal(febDetails.draws[0].result, /^\d{2}$/.test(entries[1].sequence.slice(62, 64)) ? entries[1].sequence.slice(62, 64) : null));
console.log(`${checks} monthly-window checks passed (${((performance.now() - start) / 1000).toFixed(2)}s).`);
