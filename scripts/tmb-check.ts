import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { analyzeTmb, tmbPool, TMB_GROUPS, TMB_RECIPES } from '../src/lib/lottery/tmb-experiment';
import type { MonthEntry } from '../src/lib/lottery/month-window';
let checks=0;function check(v:unknown){assert.ok(v);checks++;}
let seed=123;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed%100;};
const entries:MonthEntry[]=[2023,2024,2025,2026].map(y=>({year:String(y+543).slice(-2),digits:2,is_date_sorted:true,sequence:Array.from({length:(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/86400000},(_,i)=>i%17===0?'--':String(random()).padStart(2,'0')).join('')}));
for(const group of TMB_GROUPS)for(let n=40;n<=60;n++){
  const p=tmbPool(Array.from({length:300},random),group,n);
  check(p.base.length===n && p.adjusted.length===n && new Set(p.adjusted).size===n);
  check(!p.audit.some(a=>a.hot&&a.adjusted));
  check(p.audit.filter(a=>a.group==='Top').length===34 && p.audit.filter(a=>a.group==='Mid').length===33);
}
const p=tmbPool([0,1,2,0,1,2],'Top',40);check(p.gapLimit===2 && p.gapSamples===3 && p.audit.find(a=>a.number==='99')?.censored);
assert.throws(()=>tmbPool([], 'Top',40));assert.throws(()=>tmbPool([1],'Top',39));
const opts={entries,year:2026,bet:1,payout:100};const a=analyzeTmb(opts);
check(a.months.length===12);
const mutated=entries.map(e=>e.year==='69'?{...e,sequence:'99'.repeat(e.sequence.length/2)}:e);
const b=analyzeTmb({...opts,entries:mutated});
assert.deepEqual(a.months[0].numbers,b.months[0].numbers);assert.deepEqual(a.months[0].recipe,b.months[0].recipe);assert.deepEqual(a.months[0].pool,b.months[0].pool);checks+=3;
for(let month=1;month<12;month++){
 const start=(Date.UTC(2026,month,1)-Date.UTC(2026,0,1))/86400000*2;
 const changed=entries.map(e=>e.year==='69'?{...e,sequence:e.sequence.slice(0,start)+'99'.repeat((e.sequence.length-start)/2)}:e);
 const r=analyzeTmb({...opts,entries:changed});
 assert.deepEqual(r.months[month].recipe,a.months[month].recipe);
 assert.deepEqual(r.months[month].numbers,a.months[month].numbers);checks+=2;
}
assert.throws(()=>analyzeTmb({...opts,entries:[...entries,entries[0]]}));
assert.throws(()=>analyzeTmb({...opts,entries:entries.map(e=>({...e,is_date_sorted:false}))}));checks+=2;
const missing=analyzeTmb({...opts,entries:entries.filter(e=>e.year!=='68')});check(missing.months.length===0 && missing.skipped.length===12);
const future=analyzeTmb({...opts,entries:[...entries,{year:'70',digits:3,is_date_sorted:false,sequence:'invalid'}]});assert.deepEqual(a,future);checks++;
const scaled=analyzeTmb({...opts,bet:10});check(scaled.profit===a.profit*10&&scaled.cost===a.cost*10&&scaled.maxDD===a.maxDD*10);
for(const m of a.months){
  const seq=entries.find(e=>Number(e.year)+1957===Math.floor(m.month/12))!.sequence;
  const offset=(Date.UTC(2026,m.month%12,1)-Date.UTC(2026,0,1))/86400000;
  const count=(Date.UTC(2026,m.month%12+1,1)-Date.UTC(2026,m.month%12,1))/86400000;
  const draws=(seq.slice(offset*2,(offset+count)*2).match(/.{2}/g)??[]).filter(v=>/^\d\d$/.test(v));
  check(draws.filter(v=>m.numbers.includes(v)).length*100-m.recipe.n*draws.length===m.profit);
  check(draws.filter(v=>m.baseNumbers.includes(v)).length*100-m.recipe.n*draws.length===m.baseProfit);
}
check(TMB_RECIPES.length===1470);
if(process.argv[2]){
  const input=JSON.parse(readFileSync(process.argv[2],'utf8'));
  const rows=input.rows.filter((e:MonthEntry & {position:string})=>e.digits===2&&e.position==='สองบน');
  const result=analyzeTmb({entries:rows,year:2026,bet:1,payout:100});
  writeFileSync('/tmp/tmb-hanoi-result.json',JSON.stringify(result,null,2));
  console.log(JSON.stringify({asOf:result.asOf,profit:result.profit,base:result.baseProfit,roi:result.roi,days:result.days,dominant:result.dominant,dominance:result.dominance,dd:result.maxDD,months:result.months.map(m=>({month:m.month,recipe:m.recipe,profit:m.profit,base:m.baseProfit,hot:m.pool.hotLimit,gap:m.pool.gapLimit})),groups:result.groupReturns},null,2));
}
console.log(`${checks} TMB checks passed`);
