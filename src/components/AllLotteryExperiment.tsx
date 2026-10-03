'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useAuth } from './LiffProvider';
import { Alert, SectionTitle, Spinner } from './ui';
import { MonthlyPnlBars } from './PortfolioCharts';
import { formatSigned } from '@/lib/format';
import { labKey, type LabFormula, type LabGroup, type LabOptions, type LabSummary, type LabReport } from '@/lib/lottery/lab-all';
import type { MonthEntry } from '@/lib/lottery/month-window';
import { isMid30Formula, MID30_FORMULAS } from '@/lib/lottery/mid30';
const TmbDetail = dynamic(() => import('./TmbExperiment').then(m => m.TmbExperiment), { loading: () => <Spinner /> });
const LaoOriginal = dynamic(() => import('./Tb9Experiment').then(m => m.Tb9Experiment), { loading: () => <Spinner /> });
const Mid30Detail = dynamic(() => import('./Mid30Detail').then(m => m.Mid30Detail), { loading: () => <Spinner /> });
type Entry = MonthEntry & LabGroup;
type Result = LabGroup & { summary?: LabSummary; error?: string };
type Response = Result & { id: number; type: 'batch' | 'detail'; report?: LabReport; group: LabGroup; done: number; total: number };
export function AllLotteryExperiment({ groups, formula }: { groups: LabGroup[]; formula: LabFormula }) {
  const { api } = useAuth();
  const mid30 = isMid30Formula(formula) ? MID30_FORMULAS[formula] : null;
  const formulaName = mid30?.name ?? formula;
  const [year, setYear] = useState(new Date().getFullYear()), [bet, setBet] = useState('1'), [payout, setPayout] = useState('100'), [strict, setStrict] = useState(!!mid30);
  const [results, setResults] = useState<Result[]>([]), [running, setRunning] = useState(false), [progress, setProgress] = useState(''), [error, setError] = useState('');
  const [selected, setSelected] = useState<LabGroup | null>(null), [detail, setDetail] = useState<LabReport | null>(null), [detailBusy, setDetailBusy] = useState(false), [query, setQuery] = useState(''), [originalOpen, setOriginalOpen] = useState(false);
  const cache = useRef<Entry[] | null>(null), worker = useRef<Worker | null>(null), runId = useRef(0);
  useEffect(() => () => { runId.current++; worker.current?.terminate(); }, []);
  const options: LabOptions = { formula, year, bet: Number(bet), payout: Number(payout), strict };
  function clear() { runId.current++; worker.current?.terminate(); worker.current = null; setRunning(false); setResults([]); setDetail(null); setSelected(null); setDetailBusy(false); setError(''); }
  async function run() {
    clear();
    if (!Number.isFinite(Number(bet)) || Number(bet) <= 0 || Number(bet) > 1e6 || !Number.isFinite(Number(payout)) || Number(payout) <= 0 || Number(payout) > 10000) { setError('ตรวจเงินแทงและเรตจ่าย'); return; }
    const id = runId.current; setRunning(true); setProgress('โหลดข้อมูลทั้งหมด…');
    try {
      if (!cache.current) cache.current = (await api<{ entries: Entry[] }>('/api/lottery/datasets?digits=2&all=1')).entries;
      if (id !== runId.current) return;
      const w = new Worker(new URL('../lib/lottery/lab-all.worker.ts', import.meta.url)); worker.current = w;
      const collected: Result[] = [];
      w.onmessage = (event: MessageEvent<Response>) => {
        const message = event.data;
        if (message.id !== runId.current) return;
        if (message.type === 'detail') { setDetailBusy(false); setDetail(message.report ?? null); if (message.error) setError(message.error); return; }
        collected.push({ ...message.group, summary: message.summary, error: message.error });
        setProgress(`${message.done}/${message.total} กลุ่ม`);
        if (message.done === message.total) { setResults([...collected].sort((a, b) => (b.summary?.profit ?? -Infinity) - (a.summary?.profit ?? -Infinity))); setRunning(false); }
      };
      w.onerror = () => { if (id === runId.current) { setRunning(false); setDetailBusy(false); setError('ตัวคำนวณหยุด กรุณาทดสอบใหม่'); w.terminate(); } };
      w.postMessage({ type: 'batch', id, groups, entries: cache.current, options });
    } catch (e) { if (id === runId.current) { setRunning(false); setError(e instanceof Error ? e.message : 'โหลดไม่สำเร็จ'); } }
  }
  function inspect(group: LabGroup) {
    if (!worker.current || !cache.current) return;
    const id = ++runId.current;
    setSelected(group); setDetail(null); setDetailBusy(true); setError('');
    worker.current.postMessage({ type: 'detail', id, groups: [group], entries: cache.current.filter(e => labKey(e) === labKey(group)), options });
  }
  const total = useMemo(() => results.reduce((s, r) => ({ count: s.count + (r.summary?.months ? 1 : 0), draws: s.draws + (r.summary?.draws ?? 0), cost: s.cost + (r.summary?.cost ?? 0), profit: s.profit + (r.summary?.profit ?? 0) }), { count: 0, draws: 0, cost: 0, profit: 0 }), [results]);
  const visible = results.filter(g => `${g.lottery} ${g.position}`.includes(query.trim()));
  const years = [...new Set([new Date().getFullYear(), 2026, 2025, 2024, 2023, 2022, 2021])].sort((a, b) => b - a);
  function download(payload: unknown, name: string) { const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
  return <div className="space-y-3.5">
    <section className="card space-y-3 p-3.5">
      <SectionTitle>ทดลอง {formulaName} · ทุกหวย 2 ตัว</SectionTitle>
      <p className="muted text-sm">{mid30 ? `${mid30.original} · ความถี่คู่ ${mid30.frequencyMonths} เดือน + หลักสิบ/หน่วย ${mid30.digitMonths} เดือน · เลือกอันดับ 31–60 จำนวน 30 เลข` : formula === 'TMB' ? '7 กลุ่ม Top/Mid/Bottom × 3–12 เดือน × 40–60 เลข · คัดด้วย 6 เดือนก่อนหน้า' : 'Top 34 + Bottom ที่ g ≥ T · เติม Mid ให้ครบ 45 · ฝึก 9 เดือนปฏิทิน · ประวัติเริ่ม 2023-01-01'} · ชุดใหม่ต้นเดือน ใช้ทั้งเดือน</p>
      <Alert tone="warn">{mid30 ? 'ต้นฉบับใช้ลาวพัฒนาสองบน หวยอื่นและสองล่างเป็นการขยายการทดลอง · ' : formula === 'TB9' ? 'ต้นฉบับใช้ลาวสตาร์สองบน หวยอื่นและสองล่างเป็นการขยายการทดลอง · ' : ''}ผลย้อนหลังยังไม่ยืนยันผลในอนาคต อันดับรายหวยอาจเกิดจากความบังเอิญ</Alert>
      <fieldset disabled={running} className="space-y-3"><div className="grid grid-cols-2 gap-2">
        <label><span className="field-label">เงินแทงต่อเลข</span><input className="field" inputMode="decimal" value={bet} onChange={e => { clear(); setBet(e.target.value); }} /></label>
        <label><span className="field-label">เรตจ่ายรวม (เท่า)</span><input className="field" inputMode="decimal" value={payout} onChange={e => { clear(); setPayout(e.target.value); }} /></label>
        <label className="col-span-2"><span className="field-label">ปีทดสอบ พ.ศ.</span><select className="field" value={year} onChange={e => { clear(); setYear(Number(e.target.value)); }}>{years.map(y => <option key={y} value={y}>{y + 543}</option>)}</select></label>
      </div>
      {formula === 'TB9' || mid30 ? <><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={strict} onChange={e => { clear(); setStrict(e.target.checked); }} />ตรวจประวัติครบทุกวัน</label><p className="dim text-xs">{mid30 ? (strict ? `ตรวจครบช่วงฝึกย้อนหลัง ${mid30.frequencyMonths} เดือนถึงก่อนเดือนทดสอบ · xx = วันงดยืนยัน · -- เป็นข้อมูลไม่ยืนยัน จึงข้ามเดือนที่ประวัติไม่ครบ` : 'ทดลองเฉพาะงวดที่มีผล: ต้องมีผลในทุกเดือนฝึก · แสดงจำนวนวันที่ไม่ยืนยัน · ข้อมูลขาดอาจเปลี่ยนชุดเลขและผลลัพธ์ · -- ไม่ถือเป็นวันงด') : strict ? 'ตรวจจาก 2023-01-01 ถึงก่อนเดือนทดสอบ · xx = วันงดยืนยัน · วันงด 8 วันในเอกสารใช้เฉพาะลาวสตาร์สองบน · -- ไม่ถือเป็นวันงด' : 'ทดลองเฉพาะงวดที่มีผล: ต้องมีผลในทุกเดือนฝึก แต่ข้อมูลขาดอาจเปลี่ยนชุดเลขและผลลัพธ์ · -- ไม่ถือเป็นวันงด · อายุเลขนับงวดจริง'}</p></> : <p className="dim text-xs">คัดกลุ่ม กรอบ และจำนวนเลขจากอดีตเท่านั้น · P95 เป็นเกณฑ์ทดลอง · วันไม่มีข้อมูลถูกข้าม ไม่ยืนยันว่าเป็นวันงด · เดือนฝึกว่างหรือปีขาดจะข้าม</p>}
      </fieldset>
      <details className="text-sm"><summary className="cursor-pointer">กติกาทดลองและข้อจำกัด</summary><div className="muted mt-2 space-y-2 text-xs">
        {mid30 ? <><p>P = (c+1)/(Nf+100) · D = (t+1)(u+1)/(Nd+10)² · คะแนน S = 0.5P + 0.5D · จัดอันดับ 00–99 คะแนนมากก่อน เท่ากันเลขน้อยก่อน</p><p>เลือกเฉพาะอันดับ 31–60 รวม 30 เลข · ใช้เดือนปฏิทินย้อนหลังตามสูตร · ใช้ผลถึงวันสุดท้ายของเดือนก่อนหน้า ล็อกชุดตลอดเดือนทดสอบ · ไม่ปรับกรอบหรือจำนวนเลขจากผลทดสอบ</p></> : formula === 'TMB' ? <><p>Top 34 / Mid 33 / Bottom 33 · เท่ากันใช้เลขน้อยก่อน · ผสมกลุ่มโดยสลับหยิบ กลุ่มเดี่ยวเติมจากกลุ่มที่เหลือให้ครบ 40–60 เลข</p><p>ตัดความถี่ &gt; P95 ของความถี่ 100 เลขในหน้าต่างฝึก · เติมเลขที่อายุ &gt; P95 ของช่วงไม่ออกที่จบแล้ว โดยหยิบอายุมากก่อนแล้วเติมตามกลุ่มให้จำนวนเดิม · อายุเลขไม่เคยพบเป็นค่าต่ำสุด</p><p>คัดสูตร/กรอบ/จำนวนเลขด้วยกำไรรวม 6 เดือนก่อนหน้า · เทียบชุดเดิมที่ใช้กลุ่ม/กรอบ/จำนวนเลขเดียวกัน · ตารางสูตรดีสุดทั้งปีในรายละเอียดเป็นการรู้ผลแล้ว ใช้เลือกอนาคตไม่ได้</p></> : <><p>จัดอันดับความถี่ 9 เดือนก่อนทดสอบ · Top 34 ทั้งหมด + Bottom ที่ g ≥ T · เติม Mid ตาม g/T ให้ครบอย่างน้อย 45 เลข · p = (ความถี่ + 1)/(งวดฝึก + 100) · T = ceil(log(0.5)/log(1−p))</p><p>g นับงวดจริงตั้งแต่ผลล่าสุดจากประวัติเริ่ม 2023-01-01 · เลขไม่เคยพบใช้จำนวนงวดประวัติเป็นค่าต่ำสุด · ค่า 0.5 ไม่ใช่ความแม่นยำ 50% · เรตจ่ายต้นฉบับ 100 เท่า เปลี่ยนเรตคือการจำลองเพิ่มเติม</p></>}
        <p>เลขหายไปนานไม่ได้ทำให้โอกาสงวดถัดไปสูงขึ้นโดยอัตโนมัติ · เดือนล่าสุดอาจยังไม่ครบ · ข้อมูลแก้ไขทำให้ผลและชุดเลขเปลี่ยนได้</p>
      </div></details>
      <button className="btn btn-primary" disabled={running || !groups.length} onClick={() => void run()}>{running ? `กำลังทดสอบ ${progress}` : `ทดสอบทุกหวย (${groups.length} กลุ่ม)`}</button>
      {running ? <button className="underline text-sm" onClick={clear}>หยุดทดสอบ</button> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
    </section>
    {results.length ? <section className="card space-y-3 p-3.5">
      <SectionTitle>ทดสอบได้ {total.count}/{results.length} กลุ่ม · {total.draws.toLocaleString()} งวด</SectionTitle>
      <p>กำไรรวม {formatSigned(total.profit)} · ROI {total.cost ? (total.profit / total.cost * 100).toFixed(2) : '—'}%</p>
      <p className="dim text-xs">รวมเฉพาะเดือนที่คำนวณได้ ไม่ใช่พอร์ตกระจายความเสี่ยง · ช่วงข้อมูลแต่ละหวยอาจต่างกัน · กดชื่อหวยดูชุดเลขรายเดือนและ audit · DD วัดจากทุนเริ่มต้น</p>
      <button className="underline text-sm" onClick={() => download({ options, results }, `${formula}-all-${year}.json`)}>ดาวน์โหลดสรุปทุกหวย JSON</button>
      <input aria-label="ค้นหาหวย" className="field" placeholder="ค้นหาหวย / ตำแหน่ง" value={query} onChange={e => setQuery(e.target.value)} />
      <div className="max-h-96 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['หวย / ตำแหน่ง', 'เดือน', 'ถูก/งวด', 'กำไร', 'ROI', ...(formula === 'TMB' ? ['ชุดเดิม'] : []), 'DD สูงสุด', 'Loss streak', 'ลบช่วงนั้น', 'ข้อมูลถึง'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(g => <tr className="row" key={labKey(g)}><td className="p-2"><button className="underline" onClick={() => inspect(g)}>{g.lottery} · {g.position}</button></td>{g.summary?.months ? [g.summary.months, `${g.summary.wins}/${g.summary.draws}`, formatSigned(g.summary.profit), `${g.summary.roi.toFixed(2)}%`, ...(formula === 'TMB' ? [formatSigned(g.summary.baseProfit ?? 0)] : []), formatSigned(g.summary.maxDD), g.summary.lossStreak, formatSigned(g.summary.lossAmount), g.summary.asOf].map((v, i) => <td className="p-2" key={i}>{v}</td>) : <td className="p-2" colSpan={formula === 'TMB' ? 9 : 8}>{g.error ?? `ข้าม ${g.summary?.skipped.length ?? 0} เดือน · ${g.summary?.skipped[0] ?? 'ไม่มีเดือนทดสอบ'}`}</td>}</tr>)}</tbody></table></div>
    </section> : null}
    {detailBusy ? <Spinner /> : null}
    {detail && selected ? <>
      <button className="underline text-sm" onClick={() => download({ group: selected, options, ...detail }, `${formula}-${selected.lottery}-${selected.position}-${year}.json`)}>ดาวน์โหลดผลรายหวยพร้อมชุดเลขและ audit</button>
      {detail.tmb ? <TmbDetail key={labKey(selected) + year} groups={[selected]} provided={{ report: detail.tmb, year, bet: Number(bet), payout: Number(payout) }} /> : null}
      {detail.mid30 ? <Mid30Detail group={selected} report={detail} strict={strict} payout={payout} /> : null}
      {detail.tb9 ? <section className="card space-y-3 p-3.5"><SectionTitle>{selected.lottery} · {selected.position} · ข้อมูลถึง {detail.summary.asOf}</SectionTitle>
        <p className="dim text-xs">{strict ? 'ตรวจประวัติครบทุกวัน' : 'ทดลองเฉพาะผลที่มีข้อมูล'} · ข้าม {detail.summary.skipped.length} เดือน · เรตจ่าย {payout} เท่า</p>
        <MonthlyPnlBars months={detail.tb9.map(m => ({ label: m.selection.target_month, profit: m.profit }))} dividers={[]} />
        <div className="max-h-96 overflow-auto">{[...detail.tb9].reverse().map(m => <details className="border-b py-3" key={m.selection.target_month}><summary className="cursor-pointer text-sm">{m.selection.target_month}{m.partial ? ' (ยังไม่ครบเดือน)' : ''} · {m.selection.candidate_count} เลข · ถูก {m.wins}/{m.draws.length} · กำไร {formatSigned(m.profit)}</summary>
          <p className="dim my-2 text-xs">ฝึก {m.selection.training_start} ถึงก่อน {m.selection.training_end_exclusive} · {m.selection.training_draws} งวด · ไม่ยืนยันในเดือนทดสอบ {m.unobserved} วัน</p><p className="tnum text-sm leading-7">{m.selection.candidates.join(' ')}</p>
          <details><summary className="cursor-pointer text-sm">ตรวจครบ 100 เลข</summary><div className="max-h-80 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['อันดับ', 'เลข', 'กลุ่ม', 'ความถี่', 'ล่าสุด', 'g', 'p', 'T', 'g/T', 'เหตุผล'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{m.selection.audit.map(a => <tr className="row" key={a.number}>{[a.rank, a.number, a.group, a.count, a.last_date ?? 'ไม่เคยพบ', `${a.gap_is_lower_bound ? '≥' : ''}${a.gap}`, a.p.toFixed(6), a.threshold, (a.gap / a.threshold).toFixed(3), a.reason ?? 'ไม่คัด'].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div></details>
          <details><summary className="cursor-pointer text-sm">ผลรายงวด ({m.draws.length})</summary><div className="max-h-80 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['วันที่', 'ผล', 'ถูก', 'กำไร', 'สะสม'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{m.draws.map(d => <tr className="row" key={d.date}>{[d.date, d.top2, d.won ? '✓' : '−', formatSigned(d.profit), formatSigned(d.cumulative)].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div></details>
        </details>)}</div>
        <details><summary className="cursor-pointer text-sm">เดือนที่ข้าม ({detail.summary.skipped.length})</summary>{detail.summary.skipped.map(s => <p className="dim text-xs" key={s}>{s}</p>)}</details>
      </section> : null}
    </> : null}
    {formula === 'TB9' ? <details className="card p-3.5" onToggle={e => setOriginalOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm">ลาวสตาร์สองบนตามต้นฉบับ · คลัง snapshot เดิม</summary><div className="mt-3">{originalOpen ? <LaoOriginal groups={groups} /> : null}</div></details> : null}
  </div>;
}
