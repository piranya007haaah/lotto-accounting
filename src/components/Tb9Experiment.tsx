"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, useAuth } from "./LiffProvider";
import { Alert, Chip, SectionTitle, Spinner } from "./ui";
import { formatSigned } from "@/lib/format";
import type { MonthEntry } from "@/lib/lottery/month-window";
import { checkTop3, datasetDraws, evaluateMonth, missingDates, monthDate, monthSerial, verifiedSelection, type Draw } from "@/lib/lottery/tb9-fixed";
import { listSnapshots, saveSnapshot, type Snapshot } from "@/lib/lottery/tb9-snapshots";

export function Tb9Experiment({ groups }: { groups: { lottery: string; position: string }[] }) {
  const { api } = useAuth();
  const group = groups.find((g) => /^(หวย)?ลาวสตาร์$/.test(g.lottery) && g.position === "สองบน");
  const lottery = group?.lottery;
  const [rows, setRows] = useState<Draw[] | null>(null), [error, setError] = useState("");
  const [crossCheck, setCrossCheck] = useState("");
  const [month, setMonth] = useState(""), [bet, setBet] = useState("1"), [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("months"), [revisions, setRevisions] = useState<Snapshot[]>([]);
  const [note, setNote] = useState(""), [saving, setSaving] = useState(false), [stored, setStored] = useState<Snapshot | null>(null);
  const activeMonth = useRef(month);
  useEffect(() => { activeMonth.current = month; }, [month]);
  useEffect(() => {
    if (!lottery) return;
    let cancelled = false; setRows(null); setError("");
    void Promise.all([
      api<{ entries: MonthEntry[] }>(`/api/lottery/datasets?${new URLSearchParams({ lottery, position: "สองบน", digits: "2" })}`),
      api<{ entries: MonthEntry[] }>(`/api/lottery/datasets?${new URLSearchParams({ lottery, position: "สามบน", digits: "3" })}`).catch((e: unknown) => { if (e instanceof ApiError && e.code === "not_found") return null; throw e; }),
    ]).then(([data, triples]) => {
      const next = datasetDraws(data.entries);
      const checked = triples ? checkTop3(next, triples.entries) : 0;
      if (!next.length) throw new Error("ไม่มีผลลาวสตาร์ตั้งแต่ 2023-01-01");
      if (!cancelled) { setRows(next); setMonth(next[next.length - 1].date.slice(0, 7)); setCrossCheck(checked ? `ตรวจท้ายสามบนตรงกัน ${checked}/${next.length} งวด` : "ไม่มีสามบนให้ตรวจเทียบ"); }
    }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "โหลดไม่สำเร็จ"); });
    return () => { cancelled = true; };
  }, [api, lottery, retry]);
  const months = useMemo(() => {
    if (!rows?.length) return [];
    const end = monthSerial(rows[rows.length - 1].date.slice(0, 7));
    return Array.from({ length: Math.max(0, end - monthSerial("2023-10") + 2) }, (_, i) => monthDate(monthSerial("2023-10") + i));
  }, [rows]);
  const report = useMemo(() => {
    if (!rows || !month) return null;
    try {
      const selection = stored ?? verifiedSelection(rows, month);
      const result = evaluateMonth(selection, rows, Number(bet));
      return { selection, result, error: "" };
    } catch (e) { return { selection: null, result: null, error: e instanceof Error ? e.message : "คำนวณไม่สำเร็จ" }; }
  }, [rows, month, bet, stored]);
  const history = useMemo(() => (rows ? months.filter((m) => m <= rows[rows.length - 1].date.slice(0, 7)).map((m) => {
    try { const selection = verifiedSelection(rows, m); return { month: m, selection, result: evaluateMonth(selection, rows, Number(bet)), error: "" }; }
    catch (e) { return { month: m, selection: null, result: null, error: e instanceof Error ? e.message : "คำนวณไม่ได้" }; }
  }) : []), [rows, months, bet]);
  const comparable = history.filter((h) => h.month >= "2024-01" && h.month <= "2026-08" && h.result);
  const total = comparable.reduce((s, h) => ({ days: s.days + h.result!.draws.length, wins: s.wins + h.result!.wins, cost: s.cost + h.result!.cost, profit: s.profit + h.result!.profit }), { days: 0, wins: 0, cost: 0, profit: 0 });
  useEffect(() => {
    let cancelled = false; setStored(null); setNote(""); setRevisions([]);
    if (month) void listSnapshots(month).then((list) => { if (!cancelled) setRevisions(list); }).catch(() => { if (!cancelled) setNote("เบราว์เซอร์นี้ไม่อนุญาตคลัง snapshot ในเครื่อง"); });
    return () => { cancelled = true; };
  }, [month]);
  const current = report?.selection, result = report?.result;
  const observedEnd = rows?.length ? new Date(Date.parse(rows[rows.length - 1].date) + 86400000).toISOString().slice(0, 10) : "";
  const missing = rows && observedEnd ? missingDates(rows, observedEnd).filter((d) => d.startsWith(month)) : [];
  async function save() {
    if (!current || !rows || stored) return;
    setSaving(true); setNote("");
    try {
      const saved = await saveSnapshot(current, rows), list = await listSnapshots(month);
      if (activeMonth.current !== month) return;
      setRevisions(list); setStored(saved); setNote("บันทึก snapshot ในเครื่องแล้ว");
    }
    catch { setNote("บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์พื้นที่จัดเก็บของเบราว์เซอร์"); }
    finally { setSaving(false); }
  }
  function download() {
    if (!stored) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(stored, null, 2)], { type: "application/json" }));
    const a = document.createElement("a"); a.href = url; a.download = `TB9-Fixed-1.0-${month}-${stored.data_version.slice(0, 12)}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <div className="space-y-3.5">
    <section className="card space-y-3 p-3.5">
      <SectionTitle>ทดลอง TB9-Fixed v1.0 · ลาวสตาร์ 2 ตัวบน</SectionTitle>
      <p className="muted text-sm">Top 34 + Bottom ที่ g ≥ T · เติมเฉพาะ Mid ให้ครบ 45 · ชุดคงที่ตลอดเดือน 45–67 เลข · จ่ายรวม 100 เท่า</p>
      <Alert tone="warn">ผลจำลองเท่านั้น สูตรถูกเลือกจากข้อมูลย้อนหลังแล้ว จึงยังไม่ใช่การทดสอบอิสระ เลขหายไปนานไม่ได้แปลว่าต้องออก และเกณฑ์ 0.5 ไม่ใช่ความแม่นยำ 50%</Alert>
      {!lottery ? <p>{groups.length ? "ไม่พบลาวสตาร์ 2 ตัวบนในรายชื่อหวยของระบบ" : "กำลังรอรายชื่อหวยลาวสตาร์จากระบบ"}</p> : !rows && !error ? <Spinner /> : null}
      {error ? <Alert tone="error">{error} <button className="underline" onClick={() => setRetry((n) => n + 1)}>ลองใหม่</button></Alert> : null}
      {rows ? <><div className="grid grid-cols-2 gap-2">
        <label><span className="field-label">เดือนเป้าหมาย (ค.ศ.)</span><select className="field" value={month} onChange={(e) => { setStored(null); setMonth(e.target.value); }}>{[...months].reverse().map((m) => <option key={m}>{m}</option>)}</select></label>
        <label><span className="field-label">เงินแทงต่อเลข (หน่วย)</span><input className="field" inputMode="decimal" value={bet} onChange={(e) => setBet(e.target.value)} /></label>
      </div><p className="dim text-xs">ประวัติเริ่ม 2023-01-01 ตามเอกสาร · ข้อมูลถึง {rows[rows.length - 1].date} · งดเฉพาะ 8 วันที่ยืนยันในเอกสาร · เดือนล่าสุดอาจยังไม่ครบ · {crossCheck}</p></> : null}
    </section>
    {report?.error ? <Alert tone="error">{report.error}</Alert> : null}
    {report?.error && revisions.length ? <section className="card space-y-2 p-3.5"><p>เปิดชุดเดิมที่บันทึกไว้ (ข้อมูลปัจจุบันคำนวณไม่ได้)</p>{revisions.map((s, i) => <button key={s.revision_id} className="block underline" onClick={() => setStored(s)}>revision {i + 1} · {s.generated_at}</button>)}</section> : null}
    {current && result ? <>
      <section className="card space-y-3 p-3.5">
        <SectionTitle>{month} · {current.candidate_count} เลข</SectionTitle>
        <p className="text-sm">ฝึก {current.training_start} ถึงก่อน {current.training_end_exclusive} · {current.training_draws} งวด</p>
        <p>Top {current.audit.filter((a) => a.reason === "top_all").length} · Bottom {current.audit.filter((a) => a.reason === "bottom_gap").length} · Mid เติม {current.audit.filter((a) => a.reason === "mid_fill").length}</p>
        <p className="tnum rounded-xl bg-[var(--accent-tint)] p-3 leading-8">{current.candidates.join(" ")}</p>
        <p>ถูก {result.wins}/{result.draws.length} งวด · ต้นทุน {result.cost.toLocaleString()} · รับ {result.received.toLocaleString()} · กำไร {formatSigned(result.profit)} · ROI {result.roi.toFixed(2)}%</p>
        {missing.length ? <Alert tone="warn">เดือนนี้มีผลขาด {missing.length} วัน: {missing.join(", ")} · ผลรวมเฉพาะงวดที่มีข้อมูล</Alert> : null}
        <details><summary className="cursor-pointer font-semibold">คลัง snapshot ทดลองในเครื่อง ({revisions.length} revision)</summary>
          <p className="muted my-2 text-xs">เก็บเฉพาะเบราว์เซอร์นี้ ยังไม่ซิงก์ข้ามเครื่อง การล้างข้อมูลเว็บทำให้คลังหาย ควรดาวน์โหลดสำรอง · ชุดเดิมไม่เขียนทับ แหล่งข้อมูลเปลี่ยนจะเพิ่ม revision · เวลาเป็นเวลาที่สร้างจริง</p>
          <select className="field" value={stored?.revision_id ?? ""} onChange={(e) => setStored(revisions.find((s) => s.revision_id === e.target.value) ?? null)}><option value="">คำนวณจากข้อมูลปัจจุบัน</option>{revisions.map((s, i) => <option key={s.revision_id} value={s.revision_id}>revision {i + 1} · {s.generated_at} · {s.candidate_count} เลข</option>)}</select>
          {stored ? <><p className="mt-2 break-all text-xs">SHA256 {stored.data_version}</p><button className="mt-2 underline" onClick={download}>ดาวน์โหลด snapshot JSON พร้อม audit</button></> : <button className="mt-2 underline" disabled={saving} onClick={save}>{saving ? "กำลังบันทึก…" : "บันทึก snapshot ในเครื่อง"}</button>}
          {note ? <p role="status" className="mt-2 text-sm">{note}</p> : null}
        </details>
      </section>
      <div className="flex gap-2 overflow-x-auto">{[["months", "ผลย้อนหลัง"], ["draws", "รายงวด"], ["audit", "ตรวจ 100 เลข"]].map(([id, label]) => <Chip key={id} active={tab === id} onClick={() => setTab(id)}>{label}</Chip>)}</div>
      <section className="card space-y-3 p-3.5">
        {tab === "months" ? <><SectionTitle>ชุดคงที่ใหม่ทุกเดือน · ผลจำลองจากข้อมูลปัจจุบัน</SectionTitle><p className="text-sm">ช่วงเทียบเอกสาร ม.ค. 2024–ส.ค. 2026: คำนวณได้ {comparable.length}/32 เดือน · ถูก {total.wins}/{total.days} งวด · กำไร {formatSigned(total.profit)} · ROI {total.cost ? (total.profit / total.cost * 100).toFixed(4) : "—"}%</p><p className="dim text-xs">เอกสารอ้างอิง 973 งวด ถูก 548 กำไร 2,802 ที่เงินแทง 1 · ผลต่างอาจเกิดจากข้อมูลคนละเวอร์ชัน</p>
          <div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>เดือน</th><th>เลข</th><th>ถูก/งวด</th><th className="text-right">กำไร</th></tr></thead><tbody>{[...history].reverse().map((h) => <tr key={h.month} className="row"><td className="py-3"><button className="underline" onClick={() => { setStored(null); setMonth(h.month); }}>{h.month}</button></td>{h.result ? <><td>{h.selection!.candidate_count}</td><td>{h.result.wins}/{h.result.draws.length}</td><td className="text-right">{formatSigned(h.result.profit)}</td></> : <td colSpan={3}>{h.error}</td>}</tr>)}</tbody></table></div></> : null}
        {tab === "draws" ? <><SectionTitle>ผลรายงวด · {month}</SectionTitle><div className="max-h-96 overflow-auto"><table className="w-full text-left text-xs"><thead><tr><th>วันที่</th><th>ผล</th><th>ถูก</th><th>กำไร</th><th>สะสม</th></tr></thead><tbody>{result.draws.map((d) => <tr className="row" key={d.date}><td className="py-3">{d.date}</td><td>{d.top2}</td><td>{d.won ? "✓" : "−"}</td><td>{formatSigned(d.profit)}</td><td>{formatSigned(d.cumulative)}</td></tr>)}</tbody></table>{!result.draws.length ? <p className="py-3">ยังไม่มีผลเดือนนี้</p> : null}</div></> : null}
        {tab === "audit" ? <><SectionTitle>ตรวจครบ 100 เลข · เรียงตามอันดับความถี่</SectionTitle><p className="dim text-xs">g = งวดจริงหลังออกล่าสุด · ≥ หมายถึงไม่เคยพบ อายุจึงเป็นค่าต่ำสุด · T = เกณฑ์อายุทดลอง · Bottom หมายถึงความถี่ต่ำ</p><div className="max-h-96 overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs"><thead><tr>{["อันดับ", "เลข", "กลุ่ม", "c", "ล่าสุด", "g", "p", "T", "g/T", "เหตุผล"].map((h) => <th className="p-2" key={h}>{h}</th>)}</tr></thead><tbody>{current.audit.map((a) => <tr className="row" key={a.number}>{[a.rank, a.number, a.group, a.count, a.last_date ?? "ไม่เคยพบ", `${a.gap_is_lower_bound ? "≥" : ""}${a.gap}`, a.p.toFixed(6), a.threshold, (a.gap / a.threshold).toFixed(3), a.reason ?? "ไม่คัด"].map((v, i) => <td className="p-2" key={i}>{v}</td>)}</tr>)}</tbody></table></div></> : null}
      </section>
    </> : null}
  </div>;
}
