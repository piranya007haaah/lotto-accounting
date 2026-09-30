import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { analyzeHvip109, hvipHistory, selectHvip109 } from '../src/lib/lottery/hvip109';
import type { MonthEntry } from '../src/lib/lottery/month-window';
let seed=109;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return String(seed%100).padStart(2,'0');};
const entries:MonthEntry[]=[2023,2024,2025,2026].map(y=>({year:String(y+543).slice(-2),digits:2,is_date_sorted:true,sequence:Array.from({length:(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/86400000},random).join('')}));
const history=hvipHistory(entries), month='2026-01', a=selectHvip109(history,month);
assert.equal(a.start10,'2025-03-01'); assert.equal(a.start9,'2025-04-01'); assert.equal(a.start60,'2025-11-02');
const changed=hvipHistory(entries.map(e=>e.year==='69'?{...e,sequence:'99'.repeat(e.sequence.length/2)}:e));
assert.deepEqual(a,selectHvip109(changed,month));
const gap={draws:new Map(history.draws),noDraw:new Set<string>()};gap.draws.delete('2025-11-02');assert.throws(()=>selectHvip109(gap,month));
gap.noDraw.add('2025-11-02');assert.equal(selectHvip109(gap,month).missing.length,0);
gap.draws.set('2025-11-02','01');assert.throws(()=>selectHvip109(gap,month));
assert.throws(()=>hvipHistory([...entries,entries[0]]));assert.throws(()=>hvipHistory(entries.map(e=>({...e,is_date_sorted:false}))));
const report=analyzeHvip109(entries,1,100,true,'2024-01','2026-09'), scaled=analyzeHvip109(entries,10,100,true,'2024-01','2026-09');
assert.equal(scaled.profit,report.profit*10);assert.equal(scaled.cost,report.cost*10);assert.equal(scaled.maxDD,report.maxDD*10);
assert.equal(report.randomProfit,0);
// Hot threshold is inclusive at exactly four; 3 survives. Empty survivors are valid selections.
const threshold={draws:new Map(history.draws),noDraw:new Set<string>()};
for (const [d] of threshold.draws) if(d >= '2025-11-02' && d < '2026-01-01') threshold.draws.set(d,'99');
for(const [,d] of ['2025-11-02','2025-11-03','2025-11-04','2025-11-05'].entries()) threshold.draws.set(d,'00');
for(const d of ['2025-11-06','2025-11-07','2025-11-08']) threshold.draws.set(d,'01');
const h=selectHvip109(threshold,month);assert.equal(h.audit[0].frequency60,4);assert.equal(h.audit[1].frequency60,3);
assert.ok(!h.candidates.includes('00'));assert.ok(!h.hotRemoved.includes('01'));
let checks=16;
const sourceArg=process.argv[2], referenceArg=process.argv[3] ?? 'scripts/hvip109-reference.py';
if(referenceArg){
 const scenarios: {month:string;draws:Record<string,string>;no_draw:string[]}[]=[...report.months.map(m=>({month:m.selection.month,draws:Object.fromEntries(history.draws),no_draw:[]}))];
 if(sourceArg){const source=JSON.parse(readFileSync(sourceArg,'utf8')),groups=new Map<string,MonthEntry[]>();for(const r of source.rows){const k=r.lottery+'|'+r.position;groups.set(k,[...(groups.get(k)??[]),r]);}for(const es of [...groups.values()].slice(0,30)){const h=hvipHistory(es);for(const m of ['2024-01','2025-02','2026-09'])try{selectHvip109(h,m,false); const dates=[];for(let t=Date.parse(`${m.slice(0,4)}-${m.slice(5)}-01`)-370*86400000;t<Date.parse(`${m}-01`);t+=86400000){const d=new Date(t).toISOString().slice(0,10);if(!h.draws.has(d))dates.push(d);}scenarios.push({month:m,draws:Object.fromEntries(h.draws),no_draw:dates});}catch{}}}
 const python=`import json,sys,importlib.util\nfrom datetime import date\nspec=importlib.util.spec_from_file_location('ref',sys.argv[1]);mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)\nout=[]\nfor s in json.load(sys.stdin):\n out.append(mod.select({date.fromisoformat(k):v for k,v in s['draws'].items()},set(date.fromisoformat(x) for x in s['no_draw']),mod.month_start(s['month'])))\njson.dump(out,sys.stdout)`;
 const result=spawnSync('python3',['-c',python,referenceArg],{input:JSON.stringify(scenarios),encoding:'utf8',maxBuffer:30*1024*1024});assert.equal(result.status,0,result.stderr);
 const refs=JSON.parse(result.stdout);
 scenarios.forEach((s,i)=>{const r=selectHvip109({draws:new Map(Object.entries(s.draws)),noDraw:new Set(s.no_draw)},s.month);const ref=refs[i];for(const [k,v] of Object.entries({TOP34:r.top,MID33:r.mid,union:r.union,hot_removed:r.hotRemoved,after_hot:r.afterHot,digit_removed:r.digitRemoved,candidates:r.candidates})){assert.deepEqual(v,ref[k]);checks++;}assert.deepEqual(r.audit.map(n=>[n.frequency10,n.frequency9,n.frequency60,n.score]),ref.audit_all_numbers.map((n:{frequency10:number;frequency9:number;frequency60:number;digit_score:number})=>[n.frequency10,n.frequency9,n.frequency60,n.digit_score]));checks+=100;});
}
console.log(`HVIP-109: ${checks} checks passed (Python parity, no-lookahead, dates, data gaps, scaling).`);
