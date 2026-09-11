"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "./LiffProvider";
import { Alert, EmptyState, SectionTitle, Spinner } from "./ui";
import { EquityChart, ProfitBar } from "./PortfolioCharts";
import { FORMULA_NAMES } from "@/lib/lottery/formulas";
import { formatSigned } from "@/lib/format";
import { monthCalendar, monthLabel, testRisk, type MonthEntry, type WindowAnalysis } from "@/lib/lottery/month-window";

type GroupOption = { lottery: string; position: string; flag: string };
const keyOf = (g: GroupOption) => JSON.stringify([g.lottery, g.position]);
const pct = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

export function MonthWindowExplorer({ groups }: { groups: GroupOption[] }) {
  const { api } = useAuth();
  const [groupKey, setGroupKey] = useState("");
  const group = groups.find((g) => keyOf(g) === groupKey) ?? groups[0];
  const lottery = group?.lottery, position = group?.position;
  const [entries, setEntries] = useState<MonthEntry[] | null>(null);
  const [testMonth, setTestMonth] = useState(0);
  const [validationMonths, setValidationMonths] = useState(3);
  const [formula, setFormula] = useState("all");
  const [capital, setCapital] = useState("100000");
  const [bet, setBet] = useState("100");
  const [payout, setPayout] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<WindowAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(0);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!lottery || !position) return;
    let cancelled = false;
    setEntries(null); setResult(null); setError(null); setBusy(true);
    void api<{ entries: MonthEntry[] }>(`/api/lottery/datasets?${new URLSearchParams({ lottery, position })}`)
      .then((data) => {
        if (cancelled) return;
        const months = monthCalendar(data.entries).filter((m) => m.days > 0);
        if (!months.length) throw new Error("หวยนี้ยังไม่มีผลที่แบ่งเดือนได้");
        setTestMonth(months[months.length - 1].id);
        setEntries(data.entries);
      }).catch((e: unknown) => {
        if (!cancelled) { setError(e instanceof Error ? e.message : "โหลดข้อมูลไม่สำเร็จ"); setBusy(false); }
      });
    return () => { cancelled = true; };
  }, [api, lottery, position, retry]);

  const months = useMemo(() => entries ? monthCalendar(entries).filter((m) => m.days > 0) : [], [entries]);
  useEffect(() => {
    setResult(null); setSelected(0);
    if (!entries) return;
    const values = [Number(capital), Number(bet), Number(payout)];
    if (!capital || !bet || !payout || !values.every(Number.isFinite) || values[0] < 0 || values[0] > 1e9 || values[1] < 1 || values[1] > 1e6 || values[2] < 1 || values[2] > 10000) {
      setError("กรอกทุน 0–1,000,000,000 เงินแทง 1–1,000,000 และเรตจ่าย 1–10,000"); setBusy(false); return;
    }
    setError(null); setBusy(true);
    let worker: Worker | undefined;
    const timer = setTimeout(() => {
      try {
        worker = new Worker(new URL("../lib/lottery/month-window.worker.ts", import.meta.url));
        worker.onmessage = (event: MessageEvent<{ result?: WindowAnalysis; error?: string }>) => {
          setBusy(false);
          if (event.data.result) { setResult(event.data.result); setSelected(event.data.result.bestMonths); }
          else setError(event.data.error ?? "คำนวณไม่สำเร็จ");
          worker?.terminate();
        };
        worker.onerror = () => { setBusy(false); setError("คำนวณไม่สำเร็จ กรุณาลองใหม่"); worker?.terminate(); };
        worker.postMessage({ entries, testMonth, validationMonths, formula,
          capital: values[0], betPerNumber: values[1], payoutRate: values[2] });
      } catch { setBusy(false); setError("เบราว์เซอร์ไม่สามารถเริ่มคำนวณได้ กรุณาลองใหม่"); }
    }, 350);
    return () => { clearTimeout(timer); worker?.terminate(); };
  }, [entries, testMonth, validationMonths, formula, capital, bet, payout]);

  const best = result?.rows.find((row) => row.months === result.bestMonths);
  const detail = result?.rows.find((row) => row.months === selected);
  const risk = detail ? testRisk(detail.test) : null;
  const maxProfit = Math.max(1, ...(result?.rows.map((row) => Math.abs(row.best.profit)) ?? []));
  return <div className="space-y-3.5">
    <section className="card space-y-3 px-3.5 py-3">
      <SectionTitle>ย้อนหลังแค่ไหน สูตรไหนกำไรดีที่สุด</SectionTitle>
      <label className="block"><span className="field-label">หวย / ตำแหน่ง · 2 ตัว</span>
        <select className="field" value={group ? keyOf(group) : ""} onChange={(e) => { setGroupKey(e.target.value); setResult(null); }}>
          {groups.map((g) => <option key={keyOf(g)} value={keyOf(g)}>{g.flag} {g.lottery} · {g.position}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label><span className="field-label">เดือนทดสอบ (แยกไว้)</span>
          <select className="field" value={testMonth} onChange={(e) => setTestMonth(Number(e.target.value))}>
            {[...months].reverse().map((m) => <option key={m.id} value={m.id}>{monthLabel(m.id)}</option>)}
          </select>
        </label>
        <label><span className="field-label">เดือนก่อนหน้าที่ใช้คัดเลือก</span>
          <select className="field" value={validationMonths} onChange={(e) => setValidationMonths(Number(e.target.value))}>
            {[1, 3, 6, 12].map((n) => <option key={n} value={n}>{n} เดือน</option>)}
          </select>
        </label>
      </div>
      <label className="block"><span className="field-label">สูตรที่นำมาเปรียบเทียบ</span>
        <select className="field" value={formula} onChange={(e) => setFormula(e.target.value)}>
          <option value="all">ค้นหาสูตรที่ดีที่สุดของแต่ละกรอบ (ทุกสูตร)</option>
          {FORMULA_NAMES.map((name) => <option key={name}>{name}</option>)}
        </select>
      </label>
      <div className="grid grid-cols-3 gap-2">
        {([{ label: "ทุนเริ่มต้น", value: capital, set: setCapital }, { label: "เงินแทง/ตัว", value: bet, set: setBet }, { label: "เรตจ่าย", value: payout, set: setPayout }]).map((f) =>
          <label key={f.label}><span className="field-label">{f.label}</span><input className="field tabular-nums" inputMode="numeric" value={f.value} onChange={(e) => f.set(e.target.value.replace(/[^\d]/g, ""))} /></label>)}
      </div>
      <p className="dim text-[11px] leading-relaxed">เกณฑ์เลือก: <b>กำไรรวมสูงสุด</b> · ลองกรอบย้อนหลัง 1, 2, 3 เดือนต่อเนื่องจนสุดข้อมูลที่ใช้เปรียบเทียบได้ โดยกันเดือนคัดเลือกและเดือนทดสอบออกก่อน</p>
    </section>
    <details className="card px-3.5 py-3 text-[12px] leading-relaxed">
      <summary className="cursor-pointer font-semibold">อ่านผลอย่างไร</summary>
      <p className="mt-2">ในแต่ละเดือนคัดเลือก สูตรสร้างชุดเลขและเลือกจำนวนเลขจากกรอบย้อนหลังที่อยู่ก่อนเดือนนั้นเท่านั้น แล้ววัดกำไรของเดือนถัดมา เลื่อนกรอบไปทีละเดือนและรวมกำไร ทุกกรอบใช้เดือนคัดเลือกเดียวกัน</p>
      <p className="mt-2">เลือกสูตรที่กำไรสูงสุดให้แต่ละกรอบ แล้วเลือกกรอบที่กำไรสูงสุดอีกครั้ง ก่อนทดสอบจะสร้างชุดเลขใหม่จากกรอบย้อนหลังล่าสุดด้วยสูตรที่เลือกไว้ ผลเดือนทดสอบไม่ใช้จัดอันดับ หากกำไรเสมอกันเลือกกรอบสั้นกว่า</p>
      <p className="mt-2">กรอบนับเป็นเดือนปฏิทินเต็มก่อนเดือนที่วัดผล วันหยุดคงตำแหน่งเดิม เดือนแรกอาจมีข้อมูลไม่ครบเดือน จำนวนเลขเลือกจากกำไรบนข้อมูลฝึก ชุดเลขคงที่ตลอดเดือนที่วัดผล</p>
    </details>
    {error ? <Alert tone="error">{error}<button type="button" className="ml-2 underline" onClick={() => setRetry((n) => n + 1)}>ลองใหม่</button></Alert> : null}
    {busy ? <Spinner label="กำลังเปรียบเทียบทุกกรอบเดือนและสูตร..." /> : null}
    {!groups.length ? <EmptyState>ยังไม่มีรายชื่อหวย</EmptyState> : null}
    {result && best ? <>
      <Alert title={`กรอบที่เลือกได้ก่อนทดสอบ: ${best.months} เดือน`}>
        <p>{best.best.formula}</p>
        <p>กำไรช่วงคัดเลือก {formatSigned(best.best.profit)} บาท · ROI {pct(best.best.roiPct)}</p>
        <p className="mt-1 text-[12px]">คัดเลือก {monthLabel(result.validationStart)} – {monthLabel(result.validationEnd)} · {best.best.days} งวด<br />ทดสอบ {monthLabel(result.testMonth)}: {formatSigned(best.test.profit)} บาท · ROI {pct(best.test.roiPct)} · {best.test.days} งวด</p>
      </Alert>
      {best.best.profit <= 0 ? <Alert tone="warn">แม้แต่กรอบที่ดีที่สุดก็ไม่มีกำไรในช่วงคัดเลือก</Alert> : null}
      <p className="dim px-1 text-[11px]">ผลทดสอบมีข้อมูลถึง {result.asOf} อาจยังไม่ครบเดือน · ค้นหา {result.rows.length} กรอบ (สูงสุด {result.maxMonths} เดือน; ข้ามกรอบที่ข้อมูลฝึกขาด) · หน้านี้รองรับ 2 ตัว</p>
      <section className="card px-3.5 py-3">
        <SectionTitle>สูตรที่ดีที่สุดของแต่ละกรอบ</SectionTitle>
        <p className="dim mb-2 text-[11px]">เรียงตามจำนวนเดือน · เลื่อนดูได้ทุกกรอบ · กดจำนวนเดือนเพื่อดูรายละเอียด</p>
        <div className="max-h-[460px] overflow-auto" tabIndex={0} role="region" aria-label="ตารางเปรียบเทียบทุกกรอบเดือน">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0" style={{ background: "var(--card)" }}><tr className="muted"><th className="py-2">กรอบ / สูตร</th><th className="text-right">กำไรคัดเลือก<br />ROI</th><th className="text-right">กำไรทดสอบ</th></tr></thead>
            <tbody>{result.rows.map((row) => <tr key={row.months} style={{ background: row.months === selected ? "var(--accent-tint)" : undefined }}>
              <td className="py-2 pr-2"><button className="whitespace-nowrap font-semibold underline" type="button" onClick={() => setSelected(row.months)} aria-pressed={selected === row.months}>{row.months} เดือน{row.months === result.bestMonths ? " ★" : ""}</button><span className="dim mt-0.5 block text-[10px]">{row.best.formula}</span></td>
              <td className="tnum text-right">{formatSigned(row.best.profit)}<span className="dim block text-[10px]">{pct(row.best.roiPct)}</span></td><td className="tnum pl-2 text-right">{formatSigned(row.test.profit)}</td>
            </tr>)}</tbody>
          </table>
        </div>
      </section>
      {detail && risk ? <section className="card space-y-3 px-3.5 py-3">
        <SectionTitle>รายละเอียดกรอบ {detail.months} เดือน</SectionTitle>
        <ProfitBar value={detail.best.profit} max={maxProfit} />
        <p className="text-[12px]">{detail.best.formula} · เดือนทดสอบใช้ {detail.test.nBet} เลข · ถูก {detail.test.wins}/{detail.test.days} งวด</p>
        <div className="grid grid-cols-2 gap-2 text-[12px]">
          <p>Max DD: {formatSigned(risk.maxDrawdown)}<span className="dim block text-[10px]">ต่ำสุดเทียบทุนตั้งต้น</span></p>
          <p>แพ้ติดกันสูงสุด: {risk.maxLossStreak} งวด<span className="dim block text-[10px]">ลบช่วงนั้น {formatSigned(risk.maxLossStreakAmount)} บาท</span></p>
        </div>
        <EquityChart values={detail.test.equity} capital={Number(capital)} monthDivs={[]} />
        <details><summary className="cursor-pointer text-[12px] font-semibold">เทียบทุกสูตรในกรอบนี้</summary>
          {detail.formulas.map((f) => <div key={f.formula} className="row flex justify-between gap-2 py-2 text-[12px]"><span>{f.formula}</span><span className="tnum text-right">{formatSigned(f.profit)} บาท<br /><span className="dim">ROI {pct(f.roiPct)}</span></span></div>)}
        </details>
        <details><summary className="cursor-pointer text-[12px] font-semibold">ผลรายเดือนที่ใช้คัดเลือก</summary>
          {detail.best.folds.map((fold) => <div key={fold.month} className="row flex justify-between gap-2 py-2 text-[12px]"><span>{monthLabel(fold.month)}<span className="dim block">{fold.nBet} เลข · {fold.days} งวด</span></span><span className="tnum">{formatSigned(fold.profit)} บาท</span></div>)}
        </details>
        <details><summary className="cursor-pointer text-[12px] font-semibold">ชุดเลขที่ใช้ในเดือนทดสอบ ({detail.test.nBet} ตัว)</summary><p className="tnum mt-2 text-[12px] leading-relaxed">{detail.test.numbers.join(" ")}</p></details>
      </section> : null}
      <Alert tone="warn">การค้นหาหลายกรอบและหลายสูตรอาจเจอตัวที่ดีเพราะความบังเอิญ กำไรคัดเลือกจึงควรดูคู่กับผลทดสอบแยก โดยเฉพาะเมื่อมีงวดน้อย ผลย้อนหลังไม่รับประกันเดือนถัดไป</Alert>
    </> : null}
  </div>;
}
