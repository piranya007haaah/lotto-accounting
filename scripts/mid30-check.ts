import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { hvipHistory } from '../src/lib/lottery/hvip109';
import { analyzeMid30, selectMid30, type Mid30Formula } from '../src/lib/lottery/mid30';
import { analyzeLabGroup, labKey, type LabGroup } from '../src/lib/lottery/lab-all';
import type { MonthEntry } from '../src/lib/lottery/month-window';

let seed = 76;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return String(seed % 100).padStart(2, '0'); };
const entries: MonthEntry[] = [2023, 2024, 2025, 2026].map(year => ({ year: String(year + 543).slice(-2), digits: 2, is_date_sorted: true, sequence: Array.from({ length: (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86400000 }, random).join('') }));
const history = hvipHistory(entries), formulas: Mid30Formula[] = ['phupha76', 'saithan65'];
const group = { lottery: 'หวยทดสอบ', position: 'สองล่าง' };
const scenarios: { formula: Mid30Formula; month: string; draws: Record<string, string> }[] = [];
let checks = 0;
for (const formula of formulas) {
  for (const month of ['2024-03', '2025-01', '2026-01', '2026-10']) {
    const selection = selectMid30(history, month, formula);
    assert.equal(selection.candidate_count, 30);
    assert.equal(new Set(selection.candidates).size, 30);
    assert.deepEqual(selection.candidates_in_rank_order, selection.all_ranks.slice(30, 60).map(r => r.number));
    assert.deepEqual(selection.candidates, [...selection.candidates_in_rank_order].sort());
    assert.deepEqual(selection.all_ranks.filter(r => r.selected).map(r => r.rank), Array.from({ length: 30 }, (_, i) => i + 31));
    assert.ok(selection.all_ranks.every(r => Number.isSafeInteger(r.score_numerator)));
    const changed = { draws: new Map(history.draws), noDraw: new Set<string>() };
    for (const [day] of changed.draws) if (day >= `${month}-01`) changed.draws.set(day, '99');
    assert.deepEqual(selectMid30(changed, month, formula), selection, 'current/future month never changes selection');
    scenarios.push({ formula, month, draws: Object.fromEntries(history.draws) }); checks += 7;
  }
  const report = analyzeMid30(entries, formula, 2026, 1, 100), scaled = analyzeMid30(entries, formula, 2026, 10, 100);
  assert.equal(report.summary.months, 12);
  assert.equal(scaled.summary.profit, report.summary.profit * 10);
  assert.equal(scaled.summary.cost, report.summary.cost * 10);
  assert.equal(scaled.summary.maxDD, report.summary.maxDD * 10);
  assert.equal(analyzeMid30(entries, formula, 2026, 1, 90).summary.profit, report.summary.profit - report.summary.wins * 10);
  assert.deepEqual(analyzeLabGroup(entries, group, { formula, year: 2026, bet: 1, payout: 100, strict: true }), { summary: report.summary, mid30: report.months });
  assert.deepEqual(report, analyzeMid30([...entries].reverse(), formula, 2026, 1, 100), 'source row order cannot change result');
  assert.ok(report.months.every(m => m.cost === m.draws.length * 30 && m.selection.candidate_count === 30));
  const gap = { draws: new Map(history.draws), noDraw: new Set<string>() };
  gap.draws.delete('2025-12-05');
  assert.throws(() => selectMid30(gap, '2026-01', formula, true), /ไม่ยืนยัน/);
  assert.deepEqual(selectMid30(gap, '2026-01', formula, false).missing, ['2025-12-05']);
  gap.noDraw.add('2025-12-05'); assert.equal(selectMid30(gap, '2026-01', formula).missing.length, 0);
  gap.draws.set('2025-12-05', '06'); assert.throws(() => selectMid30(gap, '2026-01', formula), /ทั้งผล/);
  const tie = hvipHistory(entries.map(e => ({ ...e, sequence: '00'.repeat(e.sequence.length / 2) })));
  const tied = selectMid30(tie, '2026-01', formula);
  assert.deepEqual(tied.all_ranks.filter(r => r.number[0] !== '0' && r.number[1] !== '0').map(r => r.number), Array.from({ length: 100 }, (_, i) => String(i).padStart(2, '0')).filter(n => n[0] !== '0' && n[1] !== '0'));
  scenarios.push({ formula, month: '2026-01', draws: Object.fromEntries(tie.draws) });
  const missingYear = analyzeMid30(entries.filter(e => e.year !== '68'), formula, 2026, 1, 100, false);
  assert.equal(missingYear.summary.months, 12 - (formula === 'phupha76' ? 7 : 6));
  const partial = analyzeMid30(entries.map(e => e.year === '69' ? { ...e, sequence: e.sequence.slice(0, 19 * 2) } : e), formula, 2026, 1, 100);
  assert.equal(partial.summary.asOf, '2026-01-19'); assert.equal(partial.summary.draws, 19); assert.equal(partial.months[0].partial, true);
  assert.throws(() => analyzeMid30(entries.map(e => ({ ...e, is_date_sorted: false })), formula, 2026, 1, 100));
  assert.throws(() => analyzeMid30([...entries, entries[0]], formula, 2026, 1, 100));
  assert.throws(() => analyzeMid30(entries, formula, 2026, 0, 100));
  checks += 20;
}
assert.equal(selectMid30(history, '2024-03', 'phupha76').digit_window[0], '2023-09-01');
assert.equal(selectMid30(history, '2024-03', 'phupha76').cutoff, '2024-02-29');
assert.deepEqual(selectMid30(history, '2026-10', 'phupha76').frequency_window, ['2026-03-01', '2026-09-30']);
assert.deepEqual(selectMid30(history, '2026-10', 'saithan65').digit_window, ['2026-05-01', '2026-09-30']);
checks += 4;

if (process.argv[2]) {
  const rows: (MonthEntry & LabGroup)[] = JSON.parse(readFileSync(process.argv[2], 'utf8')).rows;
  const groups = new Map<string, { group: LabGroup; entries: MonthEntry[] }>();
  for (const row of rows) { const key = labKey(row), data = groups.get(key) ?? { group: { lottery: row.lottery, position: row.position }, entries: [] }; data.entries.push(row); groups.set(key, data); }
  for (const formula of formulas) {
    for (const strict of [true, false]) {
      let valid = 0, failed = 0, count = 0;
      for (const { group, entries: source } of groups.values()) {
        count++;
        try {
          const report = analyzeLabGroup(source, group, { formula, year: 2026, bet: 1, payout: 100, strict });
          if (report.summary.months) valid++;
          assert.ok(report.mid30!.every(m => m.selection.candidate_count === 30));
          if (!strict) for (const m of report.mid30!.filter((_, i) => i === 0 || i === report.mid30!.length - 1)) {
            scenarios.push({ formula, month: m.selection.target_month, draws: Object.fromEntries(hvipHistory(source).draws) });
          }
        } catch (e) { if (e instanceof assert.AssertionError) throw e; failed++; }
      }
      assert.equal(count, groups.size); assert.ok(valid > 0);
      console.log(JSON.stringify({ formula, strict, groups: count, valid, failed, source: process.argv[2] }));
    }
  }
}
// Execute the untouched supplied selector and compare every result field/rank.
// Coverage in this parity harness certifies the fixture, never production gaps.
const python = `import json,sys,importlib.util\nfrom datetime import date\nspec=importlib.util.spec_from_file_location('ref',sys.argv[1]);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)\nout=[]\nfor s in json.load(sys.stdin):\n out.append(mod.select_candidates({date.fromisoformat(k):v for k,v in s['draws'].items()},date(2000,1,1),date(2099,12,31),mod.target_month(s['month']),s['formula']))\njson.dump(out,sys.stdout)`;
const result = spawnSync('python3', ['-c', python, 'scripts/mid30-reference.py'], { input: JSON.stringify(scenarios), encoding: 'utf8', maxBuffer: 60 * 1024 * 1024 });
assert.equal(result.status, 0, result.stderr);
const refs = JSON.parse(result.stdout);
scenarios.forEach((s, i) => {
  const history = { draws: new Map(Object.entries(s.draws)), noDraw: new Set<string>() };
  // parity uses the certified fixture interface, whereas UI strict mode checks slots.
  const r = selectMid30(history, s.month, s.formula, false);
  for (const [key, value] of Object.entries(refs[i])) { assert.deepEqual(r[key as keyof typeof r], value, `${s.formula} ${s.month} ${key}`); checks++; }
  checks += 100;
});
console.log(`MID30: ${checks} checks passed across ${scenarios.length} Python parity scenarios (both formulas, all ranks, no lookahead, dates, gaps, scaling).`);
