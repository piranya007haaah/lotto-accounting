"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Chip, SectionTitle } from "./ui";
import { EquityChart } from "./PortfolioCharts";
import { formatSigned } from "@/lib/format";
import type { BacktestParams } from "@/lib/lottery/engine";
import { inspectMonthScore, monthLabel, testRisk, type MonthEntry, type MonthScore, type WindowRow } from "@/lib/lottery/month-window";

const money = (n: number) => n.toLocaleString("th-TH");
const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
type Tab = "draws" | "numbers" | "sizes" | "training";
const tabs: [Tab, string][] = [["draws", "ผลรายงวด"], ["numbers", "เลขทั้ง 100 ตัว"], ["sizes", "ทำไมแทงเท่านี้"], ["training", "ข้อมูลที่ใช้ฝึก"]];

function MonthEvidence({ score, entries, params, isTest, onBack }: {
  score: MonthScore; entries: MonthEntry[]; params: BacktestParams; isTest: boolean; onBack: () => void;
}) {
  const [tab, setTab] = useState<Tab>("draws");
  const [allDays, setAllDays] = useState(false);
  const [day, setDay] = useState<number | null>(null);
  const [number, setNumber] = useState<string | null>(null);
  const [trainMonth, setTrainMonth] = useState<number | null>(null);
  const [size, setSize] = useState<number | null>(null);
  const evidence = useMemo(() => inspectMonthScore(score, entries, params), [score, entries, params]);
  const risk = testRisk(score);
  const chosenDay = evidence.draws.find((d) => d.day === day);
  const source = evidence.trainMonths.find((m) => m.id === trainMonth);
  const choice = evidence.sizeChoices.find((c) => c.size === size);
  return <div className="space-y-3 text-[12px]">
    <button type="button" className="font-semibold underline" onClick={onBack}>← กลับไปเปรียบเทียบสูตรและเดือน</button>
    <div className="rounded-xl p-3" style={{ background: "var(--accent-tint)" }}>
      <p className="font-bold">{isTest ? "เดือนทดสอบแยก" : "เดือนคัดเลือก"} · {monthLabel(score.month)}</p>
      <p className="mt-1">{score.formula}</p>
      <p>ฝึกจาก {monthLabel(score.trainStart)} – {monthLabel(score.trainEnd)} · {score.trainDays} งวด</p>
      <p className="mt-1 font-semibold">ใช้ชุดเลขเดิม {score.nBet} ตัว ตลอดเดือนนี้ (1 เดือน)</p>
      <p className="dim mt-1 text-[12px]">ขึ้นเดือนใหม่จึงสร้างชุดเลขใหม่ ไม่เปลี่ยนเลขระหว่างเดือน</p>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <p>กำไร <b>{formatSigned(score.profit)}</b><span className="dim block">ROI {pct(score.roiPct)}</span></p>
      <p>ถูก <b>{score.wins}/{score.days} งวด</b><span className="dim block">อัตราถูก {score.days ? (score.wins / score.days * 100).toFixed(1) : "0.0"}%</span></p>
      <p>ต้นทุนรวม {money(score.turnover)}<span className="dim block">เงินรางวัลรวม {money(score.profit + score.turnover)}</span></p>
      <p>Max DD {formatSigned(risk.maxDrawdown)}<span className="dim block">ต่ำสุดเทียบทุนตั้งต้น</span></p>
      <p>แพ้ติดกันสูงสุด {risk.maxLossStreak} งวด<span className="dim block">ลบช่วงนั้น {formatSigned(risk.maxLossStreakAmount)}</span></p>
      <p>ช่วงขาดทุนหนักสุด {risk.worstLossRunLen} งวด<span className="dim block">{formatSigned(risk.worstLossRunAmount)} บาท</span></p>
    </div>
    <EquityChart values={score.equity} capital={params.capital} monthDivs={[]} />
    <div className="flex gap-1 overflow-x-auto pb-1">{tabs.map(([id, label]) => <Chip key={id} active={tab === id} onClick={() => setTab(id)}>{label}</Chip>)}</div>
    {tab === "draws" ? <>
      <label className="flex items-center gap-2"><input type="checkbox" checked={allDays} onChange={(e) => setAllDays(e.target.checked)} />แสดงวันที่ไม่มีผลด้วย</label>
      <p className="dim text-[12px]">กดวันที่เพื่อดูรายละเอียดต้นทุนและเงินรางวัล · วันที่ไม่มีผลไม่คิดเงิน</p>
      <div className="max-h-72 overflow-auto" role="region" aria-label="ผลรายงวด" tabIndex={0}>
        <table className="w-full text-left text-[12px]"><thead><tr><th>วันที่</th><th>ผล</th><th>ถูก/ไม่ถูก</th><th className="text-right">กำไร</th><th className="text-right">สะสม</th></tr></thead>
          <tbody>{evidence.draws.filter((d) => allDays || d.result !== null).map((d) => <tr key={d.day} className="row"><td className="py-2"><button type="button" className="underline" onClick={() => setDay(d.day)}>{d.date.slice(8)} / {d.date.slice(5, 7)}</button></td><td className="tnum">{d.result ?? "—"}</td><td>{d.won === null ? "ไม่มีผล" : d.won ? "✓ ถูก" : "− ไม่ถูก"}</td><td className="tnum text-right">{formatSigned(d.profit)}</td><td className="tnum text-right">{formatSigned(d.cumulative)}</td></tr>)}</tbody>
        </table>
      </div>
      {chosenDay ? <div className="rounded-xl border p-3" style={{ borderColor: "var(--line)" }}>
        <b>รายละเอียด {chosenDay.day} {monthLabel(score.month)}</b>
        <p>ผล {chosenDay.result ?? "ยังไม่มีผล / วันหยุด"}{chosenDay.rank !== null ? ` · อันดับเลขในสูตร #${chosenDay.rank}` : ""}</p>
        <p>ต้นทุน {score.nBet} เลข × {money(params.betPerNumber)} = {money(chosenDay.cost)} บาท{chosenDay.result === null ? " (ไม่มีผล จึงไม่ลงเงิน)" : ""}</p>
        <p>เงินรางวัล {chosenDay.won ? `${money(params.betPerNumber)} × ${params.payoutRate} = ` : ""}{money(chosenDay.prize)} บาท</p>
        <p>กำไร {money(chosenDay.prize)} − {money(chosenDay.cost)} = <b>{formatSigned(chosenDay.profit)}</b> บาท</p>
        <p>ทุนหลังงวด {money(chosenDay.equity)} บาท</p>
      </div> : null}
      <p className="font-semibold">รวม {score.days} งวด · ต้นทุน {money(score.turnover)} · เงินรางวัล {money(score.profit + score.turnover)} · กำไร {formatSigned(score.profit)}</p>
    </> : null}
    {tab === "numbers" ? <>
      <p>เรียงตามสูตรจากอันดับ 1–100 · ✓ คือเลขที่แทง · กดเลขดูวันที่เคยออกในข้อมูลฝึก</p>
      <div className="grid grid-cols-5 gap-1">{evidence.numberRanks.map((n) => <button type="button" key={n.number} onClick={() => setNumber(n.number)} aria-label={`เลข ${n.number}`} className="rounded-lg border p-1.5 text-center" style={{ background: n.selected ? "var(--accent-tint)" : undefined, borderColor: "var(--line)" }}><span className="dim block text-[12px]">#{n.rank} {n.selected ? "✓" : ""}</span><b className="tnum">{n.number}</b><span className="dim block text-[12px]">{n.count} ครั้ง</span></button>)}</div>
      {number !== null ? <div><b>เลข {number} · วันที่ออกในข้อมูลฝึก</b><p className="dim mt-1 leading-relaxed">{evidence.trainMonths.flatMap((m) => Array.from({ length: m.sequence.length / 2 }, (_, i) => m.sequence.slice(i * 2, i * 2 + 2) === number ? `${i + 1} ${monthLabel(m.id)}` : null).filter(Boolean)).join(" · ") || "ไม่เคยออกในช่วงฝึกนี้"}</p></div> : null}
    </> : null}
    {tab === "sizes" ? <>
      <p>เลือก <b>{score.nBet} เลข</b> เพราะกำไรบนข้อมูลฝึกสูงสุด ถ้าเสมอเลือกจำนวนน้อยกว่า ตารางนี้ใช้ผลฝึก ไม่ใช่ผลเดือนที่กำลังวัด</p>
      <div className="max-h-72 overflow-auto" role="region" aria-label="อันดับจำนวนเลขทั้งหมด" tabIndex={0}><table className="w-full text-left text-[12px]"><thead><tr><th>อันดับ</th><th>จำนวนเลข</th><th className="text-right">กำไรฝึก</th><th className="text-right">ถูก/งวด</th></tr></thead><tbody>{evidence.sizeChoices.map((s, i) => <tr key={s.size} className="row"><td>{i + 1}</td><td className="py-2"><button type="button" className="underline" onClick={() => setSize(s.size)}>{s.size} เลข{s.size === score.nBet ? " ✓" : ""}</button></td><td className="tnum text-right">{formatSigned(s.profit)}</td><td className="text-right">{s.wins}/{s.actualDays}</td></tr>)}</tbody></table></div>
      {choice ? <div><b>ถ้าเลือก {choice.size} เลขในข้อมูลฝึก</b><p>ต้นทุน {money(choice.size * params.betPerNumber * choice.actualDays)} บาท · เงินรางวัล {money(choice.wins * params.betPerNumber * params.payoutRate)} บาท · กำไร {formatSigned(choice.profit)} บาท</p><p className="tnum mt-2 leading-relaxed">{evidence.numberRanks.slice(0, choice.size).map((n) => n.number).join(" ")}</p></div> : null}
    </> : null}
    {tab === "training" ? <>
      <p>ข้อมูลฝึก {score.trainDays} งวด · กดเดือนเพื่อเปิดผลทุกวัน วันที่ไม่มีผลแสดง “—”</p>
      <div className="max-h-56 overflow-auto">{evidence.trainMonths.map((m) => <button key={m.id} type="button" className="row flex w-full justify-between py-2 text-left underline" onClick={() => setTrainMonth(m.id)}><span>{monthLabel(m.id)}</span><span>{m.days} งวด</span></button>)}</div>
      {source ? <div><SectionTitle>ผลที่ใช้ฝึก · {monthLabel(source.id)}</SectionTitle><div className="grid grid-cols-5 gap-1">{Array.from({ length: source.sequence.length / 2 }, (_, i) => <div key={i} className="rounded-lg p-2 text-center" style={{ background: "var(--accent-tint)" }}><span className="dim block text-[12px]">วันที่ {i + 1}</span><b className="tnum">{/^\d{2}$/.test(source.sequence.slice(i * 2, i * 2 + 2)) ? source.sequence.slice(i * 2, i * 2 + 2) : "—"}</b></div>)}</div></div> : null}
    </> : null}
  </div>;
}

export function MonthWindowDetails({ row, entries, params, lottery, initialFormula, initialMonth, onClose }: {
  row: WindowRow; entries: MonthEntry[]; params: BacktestParams; lottery: string; initialFormula?: string; initialMonth?: number | "test"; onClose: () => void;
}) {
  const [formula, setFormula] = useState(initialFormula ?? row.best.formula);
  const [month, setMonth] = useState<number | "test" | null>(initialMonth ?? null);
  const content = useRef<HTMLDivElement>(null);
  const overviewScroll = useRef(0);
  const openMonth = (value: number | "test") => {
    overviewScroll.current = content.current?.parentElement?.scrollTop ?? 0;
    setMonth(value);
  };
  useEffect(() => { content.current?.parentElement?.scrollTo({ top: month === null ? overviewScroll.current : 0 }); }, [month, formula]);
  const current = row.formulas.find((f) => f.formula === formula)!;
  const score = month === "test" ? row.tests[formula] : current.folds.find((f) => f.month === month);
  const test = row.tests[formula];
  const best = formula === row.best.formula;
  return <Modal title={`รายละเอียดกรอบ ${row.months} เดือน`} subtitle={`${lottery} · ${formula}`} onClose={onClose}>
    <div ref={content}>
    <nav aria-label="เส้นทางรายละเอียด" className="analysis-context mb-4 flex flex-wrap items-center gap-x-2 text-[12px]">
      <span>กรอบ {row.months} เดือน</span><span aria-hidden="true">›</span>
      {month !== null ? <button type="button" className="min-h-11 font-semibold underline" onClick={() => setMonth(null)}>{formula}</button> : <span className="font-semibold">{formula}</span>}
      {score ? <><span aria-hidden="true">›</span><span aria-current="page">{monthLabel(score.month)}</span></> : null}
    </nav>
    {score ? <MonthEvidence key={`${formula}-${month}`} score={score} entries={entries} params={params} isTest={month === "test"} onBack={() => setMonth(null)} /> : <div className="space-y-3 text-[12px]">
      <p className="rounded-xl p-3 leading-relaxed" style={{ background: "var(--accent-tint)" }}>กรอบย้อนหลัง <b>{row.months} เดือน</b> คือช่วงข้อมูลที่ใช้สร้างเลข · ใช้ชุดเลขครั้งละ <b>1 เดือน</b> · เมื่อเลื่อนไปเดือนใหม่จะสร้างชุดเลขและเลือกจำนวนเลขใหม่ ส่วนสูตรที่ชนะเลือกจากกำไรรวมช่วงคัดเลือก</p>
      <SectionTitle>กดดูได้ทุกสูตร</SectionTitle>
      {row.formulas.map((f, i) => <button key={f.formula} type="button" aria-pressed={formula === f.formula} className="w-full rounded-xl border p-2.5 text-left" style={{ background: formula === f.formula ? "var(--accent-tint)" : undefined, borderColor: "var(--line)" }} onClick={() => { overviewScroll.current = 0; setFormula(f.formula); }}>
        <b>#{i + 1} {f.formula}{f.formula === row.best.formula ? " · ชนะช่วงคัดเลือก" : ""}</b>
        <span className="mt-1 flex justify-between gap-2"><span>คัดเลือก {formatSigned(f.profit)}<span className="dim block">ROI {pct(f.roiPct)} · {f.days} งวด</span></span><span className="text-right">ทดสอบ {formatSigned(row.tests[f.formula].profit)}<span className="dim block">ROI {pct(row.tests[f.formula].roiPct)}</span></span></span>
      </button>)}
      <SectionTitle>{formula}</SectionTitle>
      <p>{best ? "สูตรนี้ชนะจากกำไรรวมช่วงคัดเลือก" : `สูตรนี้กำไรช่วงคัดเลือกน้อยกว่าสูตรที่ชนะ ${money(row.best.profit - current.profit)} บาท`} · ผลทดสอบไม่ใช้เลือกสูตร</p>
      <p className="dim">กดเดือนเพื่อดูช่วงฝึก ชุดเลข อันดับจำนวนเลข กราฟ และผลรายงวด</p>
      <SectionTitle>เดือนที่ใช้คัดเลือก</SectionTitle>
      {current.folds.map((fold) => <button key={fold.month} type="button" className="row w-full py-2.5 text-left" onClick={() => openMonth(fold.month)}>
        <span className="flex justify-between gap-2"><b className="underline">เปิด {monthLabel(fold.month)}</b><b>{formatSigned(fold.profit)}</b></span>
        <span className="dim mt-1 block">ฝึก {monthLabel(fold.trainStart)} – {monthLabel(fold.trainEnd)} · {fold.trainDays} งวด<br />แทง {fold.nBet} เลข · ถูก {fold.wins}/{fold.days} · ROI {pct(fold.roiPct)}</span>
      </button>)}
      <p className="font-semibold">รวมคัดเลือก {formatSigned(current.profit)} บาท · ต้นทุน {money(current.turnover)} · ROI {pct(current.roiPct)}</p>
      <SectionTitle>เดือนทดสอบแยก</SectionTitle>
      <button type="button" className="w-full rounded-xl p-3 text-left" style={{ background: "var(--accent-tint)" }} onClick={() => openMonth("test")}>
        <b className="underline">เปิดผลทดสอบ {monthLabel(test.month)}</b><span className="mt-1 block">กำไร {formatSigned(test.profit)} · ROI {pct(test.roiPct)}<br />แทง {test.nBet} เลข · ถูก {test.wins}/{test.days} งวด</span>
      </button>
      {!best ? <p className="dim">ผลทดสอบของสูตรนี้แสดงเพื่อเปรียบเทียบ สูตรที่ระบบเลือกไว้ก่อนทดสอบคือ {row.best.formula}</p> : null}
    </div>}
    </div>
  </Modal>;
}
