'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from './LiffProvider';
import { Alert, SectionTitle } from './ui';
import { formatSigned } from '@/lib/format';
import { analyzeHvip109, type HvipReport } from '@/lib/lottery/hvip109';
import type { MonthEntry } from '@/lib/lottery/month-window';
type Group = { lottery: string; position: string };
type Result = Group & { report?: HvipReport; error?: string };
export function Hvip109Experiment({ groups }: { groups: Group[] }) {
  const { api } = useAuth();
  const [bet, setBet] = useState('1'), [payout, setPayout] = useState('100'), [strict, setStrict] = useState(false);
  const [from, setFrom] = useState('2024-01'), [to, setTo] = useState('');
  const [results, setResults] = useState<Result[]>([]), [progress, setProgress] = useState(''), [running, setRunning] = useState(false);
  const [error, setError] = useState(''), [selected, setSelected] = useState(''), [query, setQuery] = useState('');
  const cache = useRef(new Map<string, MonthEntry[]>()), loaded = useRef(false), runId = useRef(0);
  useEffect(() => () => { runId.current++; }, []);
  const key = (g: Group) => `${g.lottery}|${g.position}`;
  function invalidate() { setResults([]); setSelected(''); setError(''); }
  async function run() {
    if (!Number.isFinite(Number(bet)) || !Number.isFinite(Number(payout)) || !(Number(bet) > 0) || !(Number(payout) > 0) || (from && to && from > to)) { setError('ตรวจเงินแทง เรตจ่าย และช่วงเดือน'); return; }
    const id = ++runId.current; setRunning(true); setError(''); setResults([]); setSelected('');
    const next: Result[] = [];
    try {
      if (!loaded.current) {
        setProgress('โหลดข้อมูลทั้งหมด…');
        const data = await api<{ entries: (MonthEntry & Group)[] }>('/api/lottery/datasets?digits=2&all=1');
        if (id !== runId.current) return;
        const byGroup = new Map<string, MonthEntry[]>();
        for (const row of data.entries) { const k = key(row); const list = byGroup.get(k) ?? []; list.push(row); byGroup.set(k, list); }
        cache.current = byGroup; loaded.current = true;
      }
    } catch (e) { if (id === runId.current) { setError(e instanceof Error ? e.message : 'โหลดข้อมูลไม่สำเร็จ'); setRunning(false); } return; }
    // Yield between groups to keep the progress and navigation responsive.
    let cursor = 0, done = 0;
    async function worker() {
      while (cursor < groups.length && id === runId.current) {
        const g = groups[cursor++], k = key(g);
        try {
          const entries = cache.current.get(k);
          if (!entries) throw new Error('ไม่พบข้อมูลกลุ่มนี้ในชุดที่โหลด');
          if (id !== runId.current) return;
          next.push({ ...g, report: analyzeHvip109(entries, Number(bet), Number(payout), strict, from, to) });
        } catch (e) { next.push({ ...g, error: e instanceof Error ? e.message : String(e) }); }
        done++; if (id === runId.current) setProgress(`${done}/${groups.length} กลุ่ม`);
        await new Promise(resolve => setTimeout(resolve, 0));
      }
    }
    await Promise.all([worker(), worker(), worker()]);
    if (id !== runId.current) return;
    next.sort((a, b) => (b.report?.profit ?? -Infinity) - (a.report?.profit ?? -Infinity));
    setResults(next); setSelected(next.find(r => r.report?.months.length)?.lottery ? key(next.find(r => r.report?.months.length)!) : ''); setRunning(false);
  }
  const visible = results.filter(r => key(r).includes(query));
  const active = results.find(r => key(r) === selected)?.report;
  const total = useMemo(() => results.reduce((s, r) => ({ profit: s.profit + (r.report?.profit ?? 0), cost: s.cost + (r.report?.cost ?? 0), draws: s.draws + (r.report?.draws ?? 0), count: s.count + (r.report?.months.length ? 1 : 0) }), { profit: 0, cost: 0, draws: 0, count: 0 }), [results]);
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'hvip109-all-lotteries.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-3.5">
    <section className="card space-y-3 p-3.5">
      <SectionTitle>ทดลอง HVIP-109 · ทุกหวย 2 ตัว</SectionTitle>
      <p className="muted text-sm">Top 34 จาก 10 เดือน + Mid 33 จาก 9 เดือน → ตัดเลขออก ≥4 ครั้งใน 60 วัน → ตัดคะแนนรายหลักต่ำสุด 20% ปัดลง · ชุดใหม่ต้นเดือน ใช้ทั้งเดือน</p>
      <Alert tone="warn">ต้นฉบับใช้ฮานอย VIP สองบน หวยอื่นและสองล่างเป็นการขยายการทดลอง ผลย้อนหลังยังไม่ยืนยันผลในอนาคต อันดับรายหวยอาจเกิดจากความบังเอิญ</Alert>
      <fieldset disabled={running} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">{[['เงินแทงต่อเลข', bet, setBet], ['เรตจ่ายรวม (เท่า)', payout, setPayout]].map(([label, value, setter]) => <label key={label as string}><span className="field-label">{label as string}</span><input className="field" inputMode="decimal" value={value as string} onChange={e => { invalidate(); (setter as (v: string) => void)(e.target.value); }} /></label>)}
          <label><span className="field-label">เริ่มทดสอบ (ค.ศ.)</span><input type="month" className="field" value={from} onChange={e => { invalidate(); setFrom(e.target.value); }} /></label>
          <label><span className="field-label">ถึงเดือน (ว่าง = ล่าสุด)</span><input type="month" className="field" value={to} onChange={e => { invalidate(); setTo(e.target.value); }} /></label>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={strict} onChange={e => { invalidate(); setStrict(e.target.checked); }} />ตรวจครบทุกวันตามต้นฉบับ</label>
        <p className="dim text-xs">{strict ? 'ข้ามเดือนที่ช่วงฝึกมีวันที่ไม่ยืนยันผลหรือวันงด' : 'โหมดทดลองเฉพาะงวดที่มีผล: -- เป็นข้อมูลไม่ยืนยัน ไม่ถือเป็นวันงด ต้องมีผลในทุกเดือนฝึก แต่ข้อมูลขาดอาจเปลี่ยนชุดเลขและผลลัพธ์'}</p>
      </fieldset>
      <button className="btn btn-primary" disabled={running || !groups.length} onClick={() => void run()}>{running ? `กำลังทดสอบ ${progress}` : `ทดสอบทุกหวย (${groups.length} กลุ่ม)`}</button>
      {error ? <Alert tone="error">{error}</Alert> : null}
    </section>
    {results.length ? <>
      <section className="card space-y-3 p-3.5"><SectionTitle>ทดสอบได้ {total.count}/{results.length} กลุ่ม · {total.draws.toLocaleString()} งวด</SectionTitle>
        <p>กำไรรวม {formatSigned(total.profit)} · ROI {total.cost ? (total.profit / total.cost * 100).toFixed(2) : '—'}%</p>
        <p className="dim text-xs">รวมงวดเฉพาะเดือนที่คำนวณได้ ไม่ใช่พอร์ตกระจายความเสี่ยง · แต่ละหวยอาจมีช่วงทดสอบต่างกัน · เทียบก่อนกรองใช้ Top+Mid เดิมซึ่งมีต้นทุนต่างกัน · สุ่มคือค่าคาดหมายชุดขนาดเท่ากัน ไม่ใช่ผลสุ่มหนึ่งครั้ง</p>
        <button className="underline text-sm" onClick={download}>ดาวน์โหลดผลพร้อมชุดเลขและ audit</button>
        <input aria-label="ค้นหาหวย" placeholder="ค้นหาหวย / ตำแหน่ง" className="field" value={query} onChange={e => setQuery(e.target.value)} />
        <div className="max-h-96 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['หวย / ตำแหน่ง', 'เดือน', 'ถูก/งวด', 'กำไร', 'ROI', 'ก่อนกรอง', 'สุ่มคาดหมาย', 'DD สูงสุด', 'Loss streak', 'ลบช่วงนั้น'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{visible.map(r => <tr className="row" key={key(r)}><td className="p-2"><button className="underline" onClick={() => setSelected(key(r))}>{r.lottery} · {r.position}</button></td>{r.report?.months.length ? <>{[r.report.months.length, `${r.report.wins}/${r.report.draws}`, formatSigned(r.report.profit), `${r.report.roi.toFixed(2)}%`, formatSigned(r.report.baseProfit), formatSigned(r.report.randomProfit), formatSigned(r.report.maxDD), r.report.risk.maxLossStreak, formatSigned(r.report.risk.maxLossStreakAmount)].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</> : <td className="p-2" colSpan={9}>{r.error ?? `ข้าม ${r.report?.skipped.length ?? 0} เดือน · ${r.report?.skipped[0]?.reason ?? 'ไม่มีข้อมูล'}`}</td>}</tr>)}</tbody></table></div>
      </section>
      {active ? <section className="card space-y-3 p-3.5"><SectionTitle>{selected.replace('|', ' · ')} · ข้อมูลถึง {active.asOf}</SectionTitle>
        <p className="dim text-xs">{active.strict ? 'ตรวจประวัติครบตามต้นฉบับ' : 'ทดลองเฉพาะผลที่มีข้อมูล'} · ข้าม {active.skipped.length} เดือน</p>
        <div className="max-h-96 overflow-auto">{[...active.months].reverse().map(m => <details className="border-b py-3" key={m.selection.month}><summary className="cursor-pointer text-sm">{m.selection.month}{m.partial ? ' (ยังไม่ครบเดือน)' : ''} · {m.selection.candidates.length} เลข · ถูก {m.wins}/{m.draws} · กำไร {formatSigned(m.profit)}</summary><p className="dim my-2 text-xs">ฝึก {m.selection.start10}–{m.selection.cutoff} · ไม่ยืนยันในช่วงฝึก {m.selection.missing.length} วัน / เดือนทดสอบ {m.unobserved} วัน</p><p className="tnum text-sm leading-7">{m.selection.candidates.join(' ')}</p><p className="muted text-xs">รวม {m.selection.union.length} · ตัดร้อน {m.selection.hotRemoved.join(' ') || 'ไม่มี'} · ตัดรายหลัก {m.selection.digitRemoved.join(' ') || 'ไม่มี'}</p></details>)}</div>
        <details><summary className="cursor-pointer text-sm">เดือนที่ข้าม ({active.skipped.length})</summary>{active.skipped.map(m => <p key={m.month} className="dim text-xs">{m.month}: {m.reason}</p>)}</details>
      </section> : null}
    </> : null}
  </div>;
}
