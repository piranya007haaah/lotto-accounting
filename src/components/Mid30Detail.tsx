'use client';
import { Alert, SectionTitle } from './ui';
import { MonthlyPnlBars } from './PortfolioCharts';
import { formatSigned } from '@/lib/format';
import type { LabGroup, LabReport } from '@/lib/lottery/lab-all';

export function Mid30Detail({ group, report, strict, payout }: { group: LabGroup; report: LabReport; strict: boolean; payout: string }) {
  return <section className="card space-y-3 p-3.5">
    <SectionTitle>{group.lottery} · {group.position} · ข้อมูลถึง {report.summary.asOf}</SectionTitle>
    <p className="dim text-xs">{strict ? 'ตรวจประวัติครบทุกวัน' : 'ทดลองเฉพาะผลที่มีข้อมูล'} · ข้าม {report.summary.skipped.length} เดือน · เรตจ่าย {payout} เท่า · 30 เลขตลอดเดือน</p>
    <MonthlyPnlBars months={(report.mid30 ?? []).map(m => ({ label: m.selection.target_month, profit: m.profit }))} dividers={[]} />
    <div className="max-h-96 overflow-auto">{[...(report.mid30 ?? [])].reverse().map(m => <details className="border-b py-3" key={m.selection.target_month}>
      <summary className="cursor-pointer text-sm">{m.selection.target_month}{m.partial ? ' (ยังไม่ครบเดือน)' : ''} · {m.selection.candidate_count} เลข · ถูก {m.wins}/{m.draws.length} · กำไร {formatSigned(m.profit)}</summary>
      <p className="dim my-2 text-xs">ความถี่คู่ {m.selection.frequency_window.join(' ถึง ')} · {m.selection.frequency_draws} งวด<br />หลักสิบ/หน่วย {m.selection.digit_window.join(' ถึง ')} · {m.selection.digit_draws} งวด<br />ไม่ยืนยันในช่วงฝึก {m.selection.missing.length} วัน / เดือนทดสอบ {m.unobserved} วัน</p>
      {m.selection.missing.length ? <Alert tone="warn">ชุดเลขนี้คำนวณจากข้อมูลฝึกที่ยังไม่ครบ</Alert> : null}
      <p className="tnum text-sm leading-7">{m.selection.candidates.join(' ')}</p>
      <details><summary className="cursor-pointer text-sm">ตรวจครบ 100 เลข</summary>
        <div className="max-h-80 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['อันดับ', 'เลข', 'ความถี่คู่', 'หลักสิบ', 'หลักหน่วย', 'คะแนน', 'เลือก'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
          <tbody>{m.selection.all_ranks.map(a => <tr className="row" key={a.number}>{[a.rank, a.number, a.pair_count, a.tens_count, a.units_count, a.score.toFixed(8), a.selected ? '✓' : '−'].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      </details>
      <details><summary className="cursor-pointer text-sm">ผลรายงวด ({m.draws.length})</summary>
        <div className="max-h-80 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{['วันที่', 'ผล', 'ถูก', 'กำไร', 'สะสม'].map(h => <th className="p-2" key={h}>{h}</th>)}</tr></thead>
          <tbody>{m.draws.map(d => <tr className="row" key={d.date}>{[d.date, d.value, d.won ? '✓' : '−', formatSigned(d.profit), formatSigned(d.cumulative)].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div>
      </details>
    </details>)}</div>
    <details><summary className="cursor-pointer text-sm">เดือนที่ข้าม ({report.summary.skipped.length})</summary>{report.summary.skipped.map(s => <p className="dim text-xs" key={s}>{s}</p>)}</details>
  </section>;
}
