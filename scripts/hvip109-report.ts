/** Reproducible read-only batch: jiti scripts/hvip109-report.ts source.json output-directory */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { analyzeHvip109 } from '../src/lib/lottery/hvip109';
import type { MonthEntry } from '../src/lib/lottery/month-window';
const [input, out] = process.argv.slice(2);
if (!input || !out) throw new Error('Usage: jiti scripts/hvip109-report.ts source.json output-directory');
const raw = readFileSync(input, 'utf8'), source = JSON.parse(raw);
const groups = new Map<string, MonthEntry[]>();
for (const r of source.rows) if (r.digits === 2) { const k = JSON.stringify([r.lottery, r.position]); groups.set(k, [...(groups.get(k) ?? []), r]); }
const results: Record<string, unknown>[] = [], failures: object[] = [];
for (const [key, entries] of groups) {
  const [lottery, position] = JSON.parse(key);
  try {
    const observed = analyzeHvip109(entries, 1, 100, false, '2024-01', '2026-09');
    const strict = analyzeHvip109(entries, 1, 100, true, '2024-01', '2026-09');
    const { months, ...summary } = observed;
    results.push({ lottery, position, ...summary, strictMonths: strict.months.length, strictProfit: strict.profit, strictCost: strict.cost, strictDraws: strict.draws, strictRoi: strict.roi,
      months: months.map(({ selection, ...m }) => ({ ...m, month: selection.month, candidates: selection.candidates, trainingUnknownDays: selection.missing.length })),
      annual: [2024, 2025, 2026].map(year => { const ms = months.filter(m => m.selection.month.startsWith(String(year))); const cost = ms.reduce((s,m) => s+m.cost,0), profit = ms.reduce((s,m)=>s+m.profit,0); return {year,months:ms.length,draws:ms.reduce((s,m)=>s+m.draws,0),cost,profit,roi:cost?profit/cost*100:0}; }) });
  } catch (e) { failures.push({ lottery, position, reason: e instanceof Error ? e.message : String(e) }); }
}
results.sort((a,b)=>Number(b.profit)-Number(a.profit));
mkdirSync(out, { recursive: true });
const report = { version: 'HVIP-TM109-H60-D20-v1.0', retrieved_at: source.retrieved_at, source_sha256: createHash('sha256').update(raw).digest('hex'), from: '2024-01', to: '2026-09', bet:1, payout:100,
  note: 'Observed-only sensitivity experiment; -- is unknown, not confirmed cancellation. Latest month may be partial. Rankings are retrospective, not independent evidence.', results, failures };
writeFileSync(`${out}/hvip109-summary.json`, JSON.stringify(report));
const fields = ['lottery','position','asOf','draws','wins','cost','profit','roi','baseProfit','randomProfit','maxDD','strictMonths','strictProfit','strictCost','strictDraws','strictRoi'];
const quote = (v: unknown) => '"'+String(v??'').replaceAll('"','""')+'"';
writeFileSync(`${out}/hvip109-summary.csv`, '\uFEFF'+fields.join(',')+'\n'+results.map(r=>fields.map(k=>quote(r[k])).join(',')).join('\n'));
console.log(JSON.stringify({groups:groups.size,results:results.length,failures:failures.length,draws:results.reduce((s,r)=>s+Number(r.draws),0),profit:results.reduce((s,r)=>s+Number(r.profit),0),cost:results.reduce((s,r)=>s+Number(r.cost),0),strictMonths:results.reduce((s,r)=>s+Number(r.strictMonths),0),top:results.slice(0,5).map(({lottery,position,profit,roi})=>({lottery,position,profit,roi}))}));
