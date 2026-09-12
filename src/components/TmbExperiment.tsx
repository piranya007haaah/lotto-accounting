'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from './LiffProvider';
import { Alert, SectionTitle, Spinner } from './ui';
import { MonthlyPnlBars } from './PortfolioCharts';
import { monthLabel, type MonthEntry } from '@/lib/lottery/month-window';
import type { TmbReport } from '@/lib/lottery/tmb-experiment';
import { formatSigned } from '@/lib/format';
const keyOf=(g:{lottery:string;position:string})=>JSON.stringify([g.lottery,g.position]);
export function TmbExperiment({groups}:{groups:{lottery:string;position:string}[]}) {
  const {api}=useAuth();
  const [key,setKey]=useState(''),[entries,setEntries]=useState<MonthEntry[]|null>(null),[year,setYear]=useState(2026);
  const [bet,setBet]=useState('1'),[payout,setPayout]=useState('100'),[error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0);
  const [result,setResult]=useState<TmbReport|null>(null),[selected,setSelected]=useState(0);
  const group=groups.find(g=>keyOf(g)===key)??groups.find(g=>g.lottery==='หวยฮานอย VIP'&&g.position==='สองบน')??groups[0];
  const lottery=group?.lottery,position=group?.position;
  useEffect(()=>{
    if(!lottery||!position)return;
    let cancelled=false;setEntries(null);setResult(null);setError('');setBusy(true);
    void api<{entries:MonthEntry[]}>(`/api/lottery/datasets?${new URLSearchParams({lottery,position,digits:'2'})}`).then(d=>{
      if(!cancelled){setEntries(d.entries.filter(e=>e.digits===2));}
    }).catch(e=>{if(!cancelled){setError(e instanceof Error?e.message:'โหลดไม่สำเร็จ');setBusy(false);}});
    return()=>{cancelled=true;};
  },[api,lottery,position,retry]);
  useEffect(()=>{
    if(!entries)return;
    setResult(null);setError('');setBusy(true);
    let worker:Worker|undefined;
    const timer=setTimeout(()=>{
      try{
        worker=new Worker(new URL('../lib/lottery/tmb-experiment.worker.ts',import.meta.url));
        worker.onmessage=(e:MessageEvent<{result?:TmbReport;error?:string}>)=>{setBusy(false);if(e.data.result){setResult(e.data.result);setSelected(e.data.result.months.length-1);}else setError(e.data.error??'คำนวณไม่สำเร็จ');worker?.terminate();};
        worker.onerror=()=>{setBusy(false);setError('เปิดตัวคำนวณไม่สำเร็จ กรุณาลองใหม่');worker?.terminate();};
        worker.postMessage({entries,year,bet:Number(bet),payout:Number(payout)});
      }catch{setBusy(false);setError('เปิดตัวคำนวณไม่สำเร็จ');}
    },200);
    return()=>{clearTimeout(timer);worker?.terminate();};
  },[entries,year,bet,payout,retry]);
  const years=useMemo(()=>[...new Set([2026,...(entries??[]).map(e=>Number(e.year)+1957)])].sort((a,b)=>b-a),[entries]);
  const m=result?.months[selected];
  function download(){if(!result)return;const url=URL.createObjectURL(new Blob([JSON.stringify({lottery,position,bet:Number(bet),payout:Number(payout),...result},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`TMB-${lottery}-${position}-${year}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  return <div className="space-y-3.5">
    <section className="card space-y-3 p-3.5">
      <SectionTitle>ทดลอง TMB v0.1 · ตามแนวคิดจากเสียง</SectionTitle>
      <p className="muted text-sm">7 กลุ่มผสม × ย้อนหลัง 3–12 เดือน × 40–60 เลข · ล็อกเลขตลอดเดือน</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="col-span-2"><span className="field-label">หวย / ตำแหน่ง</span><select className="field" value={group?keyOf(group):''} onChange={e=>setKey(e.target.value)}>{groups.map(g=><option key={keyOf(g)} value={keyOf(g)}>{g.lottery} · {g.position}</option>)}</select></label>
        <label><span className="field-label">ปีทดสอบ พ.ศ.</span><select className="field" value={year} onChange={e=>setYear(Number(e.target.value))}>{years.map(y=><option value={y} key={y}>{y+543}</option>)}</select></label>
        <label><span className="field-label">เงินต่อเลข (หน่วย)</span><input className="field" inputMode="decimal" value={bet} onChange={e=>setBet(e.target.value)}/></label>
        <label><span className="field-label">เรตจ่ายรวม</span><input className="field" inputMode="decimal" value={payout} onChange={e=>setPayout(e.target.value)}/></label>
      </div>
      <p className="text-sm">คัดสูตรและจำนวนเลขด้วยกำไรรวมของ 6 เดือนก่อนหน้า แล้ววัดเดือนถัดไป · เทียบชุดเดิมที่ใช้กลุ่ม/กรอบ/จำนวนเลขเดียวกัน เพื่อวัดผลของการตัดและเติม</p>
      <details className="text-sm"><summary className="cursor-pointer font-semibold">กติกาทดลองและข้อจำกัด</summary><div className="mt-2 space-y-2 muted">
        <p>จัดความถี่เป็น Top 34 / Mid 33 / Bottom 33 เสมอ · เท่ากันใช้เลขน้อยก่อน · Top เรียงถี่มากก่อน, Mid เริ่มกลางอันดับ, Bottom เรียงถี่น้อยก่อน ผสมกลุ่มโดยสลับหยิบกลุ่มละเลข</p>
        <p>กลุ่มเดี่ยวมีไม่ถึง 40 เลข จึงเติมกลุ่มที่เหลือโดยสลับ Top → Mid → Bottom จนครบ กลุ่มในตารางจึงหมายถึงกลุ่มหลัก ไม่ใช่สมาชิกทั้งหมด</p>
        <p>เกณฑ์ทดลองที่กำหนดเพิ่มจากเสียง: ตัดความถี่ &gt; P95 ของความถี่ 100 เลขในหน้าต่างฝึก เติมเลขที่อายุ &gt; P95 ของช่วงไม่ออกที่จบแล้วในหน้าต่างฝึก (นับงวดจริง) เติมอายุมากก่อน แล้วหยิบตามกลุ่มให้ครบจำนวนเดิม ถ้าไม่มีช่วงจบแล้วจะไม่เติม</p>
        <p>เลขไม่เคยพบมีอายุเป็นค่าต่ำสุด ไม่ทราบวันออกก่อนประวัติ เกณฑ์ P95 ไม่ใช่ขีดจำกัดตามธรรมชาติ และเลขหายไปนานไม่ได้ทำให้โอกาสงวดถัดไปสูงขึ้นโดยอัตโนมัติ</p>
        <p>ผลเป็นการสำรวจย้อนหลังหลายสูตร ยังไม่มีชุดอนาคตอิสระยืนยัน · วันไม่มีข้อมูลถูกข้าม ไม่ยืนยันว่าเป็นวันหยุด · เดือนฝึกว่างทั้งเดือน/ปีขาดจะไม่คำนวณ · ชุดในหน้านี้คำนวณใหม่ได้เมื่อแหล่งข้อมูลถูกแก้</p>
      </div></details>
      {error?<Alert tone="error">{error} <button className="underline" onClick={()=>setRetry(v=>v+1)}>ลองใหม่</button></Alert>:null}
      {busy?<Spinner/>:null}
    </section>
    {result?<>
      <section className="card space-y-3 p-3.5">
        <SectionTitle>ผลเลือกจากอดีต · {year+543}</SectionTitle>
        <p className="text-lg font-semibold">กำไร {formatSigned(result.profit)} หน่วย · ROI {result.roi.toFixed(2)}%</p>
        <p className="text-sm">ถูก {result.wins}/{result.days} งวด · ต้นทุน {result.cost.toLocaleString()} · ชุดเดิม {formatSigned(result.baseProfit)} · ผลต่างจากตัด/เติม {formatSigned(result.profit-result.baseProfit)}</p>
        <p className="text-sm">แพ้ติดกันสูงสุด {result.lossStreak} งวด · ลบช่วงนั้น {formatSigned(result.lossAmount)} · DD สูงสุด {formatSigned(result.maxDD)}</p>
        <p className="muted text-xs">ข้อมูลถึง {result.asOf} · วันที่ไม่มีผลในปีนี้ {result.unobservedDays} วัน (อาจรวมวันหยุด) · เดือนมี * ยังไม่ครบ · หน่วยตามเงินต่อเลขที่กรอก</p>
        <p className="text-sm">กลุ่มหลักที่เลือกบ่อย: {result.dominant} ({result.dominance.toFixed(0)}% ของเดือนเต็ม) · เปลี่ยนกลุ่ม {result.switches} ครั้ง · ยังใช้สรุปว่าเป็นพฤติกรรมถาวรไม่ได้</p>
        {result.months.length?<MonthlyPnlBars months={result.months.map(m=>({label:monthLabel(m.month)+(m.partial?' *':''),profit:m.profit}))} dividers={[]}/>:<Alert tone="warn">ข้อมูลไม่พอสำหรับปีนี้ ต้องมีประวัติฝึก 12 เดือนและช่วงคัดเลือกอีก 6 เดือน</Alert>}
        {result.skipped.length?<details><summary>เดือนที่คำนวณไม่ได้ ({result.skipped.length})</summary>{result.skipped.map(s=><p className="text-xs" key={s}>{s}</p>)}</details>:null}
        <button className="text-sm underline" onClick={download}>ดาวน์โหลดผลและ audit JSON</button>
      </section>
      <section className="card space-y-3 p-3.5"><SectionTitle>รายเดือน · กดดูชุดเลข</SectionTitle><div className="overflow-x-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['เดือน','กลุ่มหลัก','กรอบ/เลข','กำไร','ชุดเดิม','ผลต่าง','Max DD ในเดือน'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{result.months.map((row,i)=><tr className="row" key={row.month}><td className="p-2"><button className="underline" onClick={()=>setSelected(i)}>{monthLabel(row.month)}{row.partial?' *':''}</button></td><td>{row.recipe.group}</td><td>{row.recipe.window} ด. / {row.recipe.n}</td><td>{formatSigned(row.profit)}</td><td>{formatSigned(row.baseProfit)}</td><td>{formatSigned(row.delta)}</td><td>{formatSigned(row.maxDD)}</td></tr>)}</tbody></table></div></section>
      {m?<section className="card space-y-3 p-3.5"><SectionTitle>ชุด {monthLabel(m.month)} · {m.recipe.n} เลข</SectionTitle><p className="text-sm">ฝึก {monthLabel(m.month-m.recipe.window)}–{monthLabel(m.month-1)} · {m.pool.draws} งวด · กำไรคัดเลือก 6 เดือนก่อนหน้า {formatSigned(m.validationProfit)}</p><p className="tnum rounded-xl bg-[var(--accent-tint)] p-3 leading-8">{[...m.numbers].sort().join(' ')}</p><p className="text-sm">ตัดเมื่อความถี่ &gt; {m.pool.hotLimit} ครั้ง · เติมเมื่ออายุ &gt; {m.pool.gapLimit??'ยังหาไม่ได้'} งวด · ช่วงไม่ออกที่จบแล้ว {m.pool.gapSamples} ช่วง</p><p className="text-xs">เข้าแทน: {m.numbers.filter(n=>!m.baseNumbers.includes(n)).sort().join(' ')||'ไม่มี'}<br/>ออกจากชุด: {m.baseNumbers.filter(n=>!m.numbers.includes(n)).sort().join(' ')||'ไม่มี'}</p><details><summary className="cursor-pointer">ตรวจครบ 100 เลข</summary><div className="max-h-80 overflow-auto"><table className="w-full text-left text-xs"><thead><tr>{['เลข','กลุ่ม','ความถี่','อายุ','เกินเกณฑ์','ชุดเดิม','ชุดใหม่'].map(h=><th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{m.pool.audit.map(a=><tr className="row" key={a.number}>{[a.number,a.group,a.count,`${a.censored?'≥':''}${a.gap}`,a.hot?'ถี่เกิน':a.overdue?'อายุเกิน':'—',a.base?'✓':'—',a.adjusted?'✓':'—'].map((v,i)=><td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div></details></section>:null}
      <section className="card space-y-3 p-3.5"><SectionTitle>เทียบทั้ง 7 กลุ่มหลัก</SectionTitle><p className="dim text-xs">แต่ละกลุ่มคัดกรอบและจำนวนเลขจาก 6 เดือนก่อนหน้าเอง แล้วรวมผลเดือนทดสอบ</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>กลุ่ม</th><th>กำไรหลังตัด/เติม</th><th>ชุดเดิม</th></tr></thead><tbody>{[...result.groupReturns].sort((a,b)=>b.profit-a.profit).map(g=><tr className="row" key={g.group}><td className="py-2">{g.group}</td><td>{formatSigned(g.profit)}</td><td>{formatSigned(g.baseProfit)}</td></tr>)}</tbody></table></div>
        <details><summary className="cursor-pointer text-sm">10 สูตรกำไรสูงสุดเมื่อรู้ผลทั้งปีแล้ว</summary><p className="my-2 text-xs">ตารางนี้เลือกจากปีทดสอบ จึงใช้ดูย้อนหลังเท่านั้น ห้ามอ่านเป็นผลที่เลือกได้ล่วงหน้า</p>{result.retrospective.map(r=><p className="text-xs py-1" key={JSON.stringify(r.recipe)}>{r.recipe.group} · {r.recipe.window} ด. · {r.recipe.n} เลข: {formatSigned(r.profit)}</p>)}</details>
      </section>
    </>:null}
  </div>;
}
