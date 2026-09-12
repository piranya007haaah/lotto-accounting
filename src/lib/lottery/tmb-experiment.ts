/** TMB v0.1: explicit experimental defaults for the owner's audio hypothesis. */
import { monthCalendar, type MonthEntry } from './month-window';
export const TMB_GROUPS = ['Top', 'Mid', 'Bottom', 'Top+Mid', 'Top+Bottom', 'Mid+Bottom', 'Top+Mid+Bottom'] as const;
export type Recipe = { group: string; window: number; n: number };
export type Audit = { number: string; group: string; count: number; gap: number; censored: boolean; hot: boolean; overdue: boolean; base: boolean; adjusted: boolean };
export type Pool = { base: number[]; adjusted: number[]; hotLimit: number; gapLimit: number | null; gapSamples: number; draws: number; audit: Audit[] };
const digits = Array.from({ length: 100 }, (_, n) => n);
const pad = (n: number) => String(n).padStart(2, '0');
export function percentile95(values: number[]): number | null {
  if (!values.length) return null;
  return [...values].sort((a,b) => a-b)[Math.ceil(values.length * .95) - 1];
}
export function tmbPool(train: number[], group: string, n: number): Pool {
  if (!train.length || !TMB_GROUPS.includes(group as typeof TMB_GROUPS[number]) || !Number.isInteger(n) || n < 40 || n > 60 || train.some(v => !Number.isInteger(v) || v < 0 || v > 99)) throw new Error('ข้อมูลหรือชุดทดลองไม่ถูกต้อง');
  const count = Array<number>(100).fill(0), last = Array<number>(100).fill(-1), intervals: number[] = [];
  train.forEach((v,i) => { count[v]++; if (last[v] >= 0) intervals.push(i-last[v]-1); last[v]=i; });
  const ranked = [...digits].sort((a,b) => count[b]-count[a] || a-b);
  const membership = Array<string>(100);
  ranked.forEach((v,i) => { membership[v] = i < 34 ? 'Top' : i < 67 ? 'Mid' : 'Bottom'; });
  const queues: Record<string,number[]> = {
    Top: ranked.slice(0,34),
    Mid: ranked.slice(34,67).sort((a,b) => Math.abs(ranked.indexOf(a)-50)-Math.abs(ranked.indexOf(b)-50) || a-b),
    Bottom: ranked.slice(67).sort((a,b) => count[a]-count[b] || a-b),
  };
  const interleave = (names: string[]) => Array.from({length:34}, (_, i) => names.flatMap(g => queues[g][i] == null ? [] : [queues[g][i]])).flat();
  const preferred = group.split('+');
  const order = [...interleave(preferred), ...interleave(['Top','Mid','Bottom'].filter(g => !preferred.includes(g)))];
  const hotLimit = percentile95(count)!;
  const gapLimit = percentile95(intervals);
  const gap = digits.map(v => train.length-1-last[v]);
  const hot = new Set(digits.filter(v => count[v] > hotLimit));
  // Unseen numbers have only a lower bound on age; do not invent their last date.
  const overdue = digits.filter(v => gapLimit != null && gap[v] > gapLimit && !hot.has(v)).sort((a,b) => gap[b]-gap[a] || a-b);
  const eligible = [...overdue, ...order.filter(v => !overdue.includes(v) && !hot.has(v))];
  const base = order.slice(0,n), adjusted = eligible.slice(0,n);
  if (adjusted.length !== n) throw new Error('เลขหลังตัดไม่พอสำหรับขนาดชุด');
  return { base, adjusted, hotLimit, gapLimit, gapSamples: intervals.length, draws: train.length,
    audit: ranked.map(v => ({number:pad(v), group:membership[v], count:count[v], gap:gap[v], censored:last[v]<0, hot:hot.has(v), overdue:overdue.includes(v), base:base.includes(v), adjusted:adjusted.includes(v)})) };
}
const real = (sequence: string) => (sequence.match(/.{2}/g) ?? []).filter(v => /^\d{2}$/.test(v)).map(Number);
export const TMB_RECIPES: Recipe[] = TMB_GROUPS.flatMap(group => Array.from({length:10},(_,i) => i+3).flatMap(window => Array.from({length:21},(_,i) => ({group, window, n:i+40}))));
export type MonthResult = { month: number; partial: boolean; recipe: Recipe; validationProfit: number; numbers: string[]; baseNumbers: string[]; wins: number; days: number; cost: number; profit: number; baseProfit: number; delta: number; maxDD: number; lossStreak: number; lossAmount: number; pool: Pool };
export type TmbReport = { version: string; year: number; asOf: string; months: MonthResult[]; skipped: string[]; profit: number; cost: number; wins: number; days: number; baseProfit: number; roi: number; maxDD: number; lossStreak: number; lossAmount: number; dominant: string; dominance: number; switches: number; groupCounts: Record<string,number>; retrospective: {recipe:Recipe; profit:number; baseProfit:number}[]; unobservedDays: number; groupReturns: {group:string; profit:number; baseProfit:number; months:number}[] };
export type TmbOptions = { entries: MonthEntry[]; year: number; bet: number; payout: number };
export function analyzeTmb({entries, year, bet, payout}: TmbOptions): TmbReport {
  if (!Number.isInteger(year) || year < 2000 || year > 2099 || !Number.isFinite(bet) || bet <= 0 || bet > 1e6 || !Number.isFinite(payout) || payout <= 0 || payout > 10000) throw new Error('ปี เงินแทง หรือเรตจ่ายไม่ถูกต้อง');
  const cal = monthCalendar(entries.filter(e => Number(e.year)+1957 <= year));
  const byMonth = new Map(cal.map(m => [m.id,m]));
  const first = cal.find(m => m.days)?.id;
  let asOf = '';
  for (const m of cal) for (let d=0;d<m.sequence.length/2;d++) if (/^\d{2}$/.test(m.sequence.slice(d*2,d*2+2))) asOf = new Date(Date.UTC(Math.floor(m.id/12),m.id%12,d+1)).toISOString().slice(0,10);
  if (first == null || !asOf) throw new Error('ไม่มีผลหวย 2 ตัว');
  const lastMonth = Number(asOf.slice(0,4))*12+Number(asOf.slice(5,7))-1;
  const cache = new Map<number, {base:Float64Array; adjusted:Float64Array}>();
  function trainAt(id:number, window:number): number[] {
    const rows: number[] = [];
    if (id-window < first!) throw new Error('ประวัติไม่ครบ 12 เดือนก่อนช่วงคัดเลือก');
    for(let i=id-window;i<id;i++) {
      const m=byMonth.get(i);
      if (!m || !m.days) throw new Error('มีเดือนฝึกไม่มีข้อมูล ไม่สามารถถือเป็นวันหยุดทั้งเดือนได้');
      rows.push(...real(m.sequence));
    }
    return rows;
  }
  function scores(id:number) {
    const found=cache.get(id); if(found) return found;
    const target=byMonth.get(id); if(!target?.days) throw new Error('มีเดือนคัดเลือกไม่มีผลหวย');
    const outcome=real(target.sequence), result={base:new Float64Array(TMB_RECIPES.length),adjusted:new Float64Array(TMB_RECIPES.length)};
    for (let w=3;w<=12;w++) {
      const train=trainAt(id,w);
      TMB_GROUPS.forEach((g,gi) => {
        const p=tmbPool(train,g,60);
        for(const mode of ['base','adjusted'] as const) {
          const counts=Array<number>(60).fill(0);
          outcome.forEach(v => {const k=p[mode].indexOf(v); if(k>=0) counts[k]++;});
          let hits=counts.slice(0,39).reduce((a,b)=>a+b,0);
          for(let n=40;n<=60;n++) { hits+=counts[n-1]; result[mode][gi*210+(w-3)*21+n-40]=bet*(payout*hits-n*outcome.length); }
        }
      });
    }
    cache.set(id,result); return result;
  }
  // Prior SIX complete calendar months select the recipe, including size. The target never participates.
  const months: MonthResult[]=[], skipped:string[]=[], totals=new Float64Array(TMB_RECIPES.length), baseTotals=new Float64Array(TMB_RECIPES.length);
  const groupReturns=TMB_GROUPS.map(group=>({group,profit:0,baseProfit:0,months:0}));
  let equity=0,peak=0,maxDD=0,streak=0,amount=0,lossStreak=0,lossAmount=0;
  for(let id=year*12;id<=Math.min(year*12+11,lastMonth);id++) {
    try {
      const validation=new Float64Array(TMB_RECIPES.length);
      for(let v=id-6;v<id;v++) scores(v).adjusted.forEach((p,i)=>{validation[i]+=p;});
      const pick=(start=0,end=TMB_RECIPES.length) => {
        let k=start;
        for(let i=start+1;i<end;i++) if(validation[i]>validation[k] || (validation[i]===validation[k] && TMB_RECIPES[i].n<TMB_RECIPES[k].n)) k=i;
        return k;
      };
      const best=pick(), recipe=TMB_RECIPES[best], pool=tmbPool(trainAt(id,recipe.window),recipe.group,recipe.n);
      const target=byMonth.get(id); if(!target?.days) throw new Error('เดือนทดสอบไม่มีผลหวย');
      const outcome=real(target.sequence), s=scores(id);
      s.adjusted.forEach((p,i)=>{totals[i]+=p;baseTotals[i]+=s.base[i];});
      groupReturns.forEach((g,i)=>{const k=pick(i*210,(i+1)*210);g.profit+=s.adjusted[k];g.baseProfit+=s.base[k];g.months++;});
      let local=0,localPeak=0,dd=0,ls=0,la=0,run=0,runAmount=0;
      outcome.forEach(v=>{
        const p=bet*((pool.adjusted.includes(v)?payout:0)-recipe.n);
        equity+=p;peak=Math.max(peak,equity);maxDD=Math.min(maxDD,equity-peak);
        local+=p;localPeak=Math.max(localPeak,local);dd=Math.min(dd,local-localPeak);
        if(p<0){streak++;amount+=p;run++;runAmount+=p;}else if(p>0){streak=0;amount=0;run=0;runAmount=0;}
        if(streak>lossStreak || (streak===lossStreak && amount<lossAmount)){lossStreak=streak;lossAmount=amount;}
        if(run>ls || (run===ls && runAmount<la)){ls=run;la=runAmount;}
      });
      const endDay=new Date(Date.UTC(Math.floor(id/12),id%12+1,0)).getUTCDate();
      months.push({month:id,partial:id===lastMonth && Number(asOf.slice(8))<endDay,recipe,validationProfit:validation[best], numbers:pool.adjusted.map(pad),baseNumbers:pool.base.map(pad), wins:outcome.filter(v=>pool.adjusted.includes(v)).length,days:outcome.length,cost:recipe.n*bet*outcome.length,profit:s.adjusted[best],baseProfit:s.base[best],delta:s.adjusted[best]-s.base[best],maxDD:dd,lossStreak:ls,lossAmount:la,pool});
    } catch(e) { skipped.push(`${Math.floor(id/12)}-${String(id%12+1).padStart(2,'0')}: ${e instanceof Error?e.message:'ข้อมูลไม่พอ'}`); streak=0;amount=0; }
  }
  const groupCounts:Record<string,number>={};
  const complete=months.filter(m=>!m.partial);
  complete.forEach(m=>{groupCounts[m.recipe.group]=(groupCounts[m.recipe.group]??0)+1;});
  const dominant=Object.keys(groupCounts).sort((a,b)=>groupCounts[b]-groupCounts[a])[0]??'—';
  const sum=(key:'profit'|'cost'|'wins'|'days'|'baseProfit')=>months.reduce((s,m)=>s+m[key],0);
  const unobservedDays=cal.filter(m=>m.id>=year*12 && m.id<=lastMonth).reduce((s,m)=>s+(m.id===lastMonth?Number(asOf.slice(8)):m.sequence.length/2)-m.days,0);
  return {version:'TMB-0.1',year,asOf,months,skipped,profit:sum('profit'),cost:sum('cost'),wins:sum('wins'),days:sum('days'),baseProfit:sum('baseProfit'),roi:sum('cost')?sum('profit')/sum('cost')*100:0,maxDD,lossStreak,lossAmount,dominant,dominance:complete.length?(groupCounts[dominant]??0)/complete.length*100:0,switches:complete.slice(1).filter((m,i)=>m.recipe.group!==complete[i].recipe.group).length,groupCounts,unobservedDays,groupReturns,retrospective:TMB_RECIPES.map((recipe,i)=>({recipe,profit:totals[i],baseProfit:baseTotals[i]})).sort((a,b)=>b.profit-a.profit || a.recipe.n-b.recipe.n).slice(0,10)};
}
