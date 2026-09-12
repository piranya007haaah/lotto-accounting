/** Read-only reproducible batch report. Input is a JSON export {retrieved_at,rows}. */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { analyzeTmb } from '../src/lib/lottery/tmb-experiment';
import type { MonthEntry } from '../src/lib/lottery/month-window';
const [inputPath,outDir]=process.argv.slice(2);
if(!inputPath||!outDir)throw new Error('Usage: jiti scripts/tmb-report.ts source.json output-directory');
const text=readFileSync(inputPath,'utf8'),source=JSON.parse(text);
const groups=new Map<string,MonthEntry[]>();
for(const row of source.rows){if(row.digits!==2)continue;const k=JSON.stringify([row.lottery,row.position]);groups.set(k,[...(groups.get(k)??[]),row]);}
const results:object[]=[], failures:object[]=[];
for(const [key,entries] of groups)for(const year of [2024,2025,2026]){
 const [lottery,position]=JSON.parse(key);
 try{const r=analyzeTmb({entries,year,bet:1,payout:100});const {months,retrospective,...summary}=r;
 if(!months.length){failures.push({lottery,position,year,reason:r.skipped.join('; ')});continue;}
 results.push({lottery,position,...summary,months:months.map(({pool,numbers,baseNumbers,...m})=>m),retrospective});
 }catch(e){failures.push({lottery,position,year,reason:e instanceof Error?e.message:String(e)});}
}
mkdirSync(outDir,{recursive:true});
writeFileSync(`${outDir}/tmb-summary.json`,JSON.stringify({version:'TMB-0.1',retrieved_at:source.retrieved_at,source_sha256:createHash('sha256').update(text).digest('hex'),bet:1,payout:100,results,failures}));
const fields=['lottery','position','year','asOf','profit','baseProfit','roi','days','dominant','dominance','switches','maxDD','unobservedDays'];
const quote=(v:unknown)=>'"'+String(v??'').replaceAll('"','""')+'"';
writeFileSync(`${outDir}/tmb-summary.csv`,'\uFEFF'+fields.join(',')+'\n'+results.map(row=>fields.map(k=>quote((row as Record<string,unknown>)[k])).join(',')).join('\n'));
console.log(JSON.stringify({groups:groups.size,results:results.length,failures:failures.length,output:outDir}));
