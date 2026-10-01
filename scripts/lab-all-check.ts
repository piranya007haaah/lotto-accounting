import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeLabGroup, labKey, type LabGroup, type LabOptions } from '../src/lib/lottery/lab-all';
import { CANCELED, datasetDraws, verifiedSelection, evaluateMonth } from '../src/lib/lottery/tb9-fixed';
import { analyzeTmb } from '../src/lib/lottery/tmb-experiment';
import type { MonthEntry } from '../src/lib/lottery/month-window';
const fixture: MonthEntry[] = [2023, 2024, 2025, 2026].map(year => ({ year: String(year + 543).slice(-2), digits: 2, is_date_sorted: true, sequence: Array.from({ length: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000 }, (_, i) => String(i % 100).padStart(2, '0')).join('') }));
const options: LabOptions = { formula: 'TB9', year: 2026, bet: 1, payout: 100, strict: true };
const other = { lottery: 'หุ้นทดสอบ', position: 'สองล่าง' };
const baseline = analyzeLabGroup(fixture, other, options);
assert.equal(baseline.summary.months, 12);
assert.equal(baseline.tb9![0].draws[0].date, '2026-01-01');
const modified = fixture.map(e => e.year === '69' ? { ...e, sequence: '99'.repeat(e.sequence.length / 2) } : e);
assert.deepEqual(analyzeLabGroup(modified, other, options).tb9![0].selection, baseline.tb9![0].selection);
const scaled = analyzeLabGroup(fixture, other, { ...options, bet: 10 });
assert.equal(scaled.summary.profit, baseline.summary.profit * 10);
assert.equal(scaled.summary.cost, baseline.summary.cost * 10);
const rate = analyzeLabGroup(fixture, other, { ...options, payout: 90 });
assert.equal(rate.summary.profit, baseline.summary.profit - 10 * baseline.summary.wins);
const holiday = fixture.map(e => e.year === '68' ? { ...e, sequence: e.sequence.slice(0, 12) + '--' + e.sequence.slice(14) } : e);
assert.equal(analyzeLabGroup(holiday, other, options).summary.months, 0, 'Lao cancellation must not exempt other lotteries');
assert.equal(analyzeLabGroup(holiday, other, { ...options, strict: false }).summary.months, 12);
const confirmed = holiday.map(e => ({ ...e, sequence: e.sequence.replace('--', 'xx') }));
assert.equal(analyzeLabGroup(confirmed, other, options).summary.months, 12);
const missingYear = fixture.filter(e => e.year !== '68');
assert.equal(analyzeLabGroup(missingYear, other, { ...options, strict: false }).summary.months, 3, 'only Oct-Dec have nine nonempty training months');
assert.throws(() => analyzeLabGroup(fixture, other, { ...options, bet: 0 }));
assert.throws(() => analyzeLabGroup(fixture.map(e => ({ ...e, is_date_sorted: false })), other, options));
const laoFixture = fixture.map(e => ({ ...e, sequence: e.sequence.match(/../g)!.map((value, i) => CANCELED.has(new Date(Date.UTC(Number(e.year) + 1957, 0, i + 1)).toISOString().slice(0, 10)) ? '--' : value).join('') }));
const lao = { lottery: 'หวยลาวสตาร์', position: 'สองบน' };
const originalRows = datasetDraws(laoFixture), laoReport = analyzeLabGroup(laoFixture, lao, options);
for (const m of laoReport.tb9!) {
  const old = verifiedSelection(originalRows, m.selection.target_month), outcome = evaluateMonth(old, originalRows);
  assert.deepEqual(m.selection, old); assert.equal(m.profit, outcome.profit); assert.equal(m.wins, outcome.wins);
}
const tmb = analyzeLabGroup(fixture, other, { ...options, formula: 'TMB' });
assert.deepEqual(tmb.tmb, analyzeTmb({ entries: fixture, year: 2026, bet: 1, payout: 100 }));
console.log('All-lottery checks passed: original parity, no lookahead, cancellation scope, holidays, missing years, scaling and payout');
if (process.argv[2]) {
  const rows: (MonthEntry & LabGroup)[] = JSON.parse(readFileSync(process.argv[2], 'utf8')).rows;
  const groups = new Map<string, { group: LabGroup; entries: MonthEntry[] }>();
  for (const row of rows) { const key = labKey(row), data = groups.get(key) ?? { group: { lottery: row.lottery, position: row.position }, entries: [] }; data.entries.push(row); groups.set(key, data); }
  const results = [];
  for (const formula of ['TMB', 'TB9'] as const) {
    const start = Date.now(), entries = [];
    for (const { group, entries: source } of groups.values()) {
      try { entries.push({ ...group, ...analyzeLabGroup(source, group, { ...options, formula, strict: false }).summary }); }
      catch (e) { entries.push({ ...group, error: e instanceof Error ? e.message : String(e) }); }
    }
    const valid = entries.filter(e => 'months' in e && e.months > 0);
    console.log(JSON.stringify({ formula, groups: entries.length, valid: valid.length, profit: valid.reduce((s, e) => s + ('profit' in e ? e.profit : 0), 0), elapsedMs: Date.now() - start }));
    assert.equal(entries.length, groups.size);
    assert(valid.length > 0);
    results.push({ formula, entries });
  }
  writeFileSync('/private/tmp/lab-all-2026-results.json', JSON.stringify({ year: 2026, bet: 1, payout: 100, strict: false, results }, null, 2));
}
