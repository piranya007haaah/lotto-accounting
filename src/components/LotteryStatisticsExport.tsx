"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert } from "@/components/ui";
import { statisticsGroupKey, type StatisticsGroup } from "@/lib/lottery/statistics";

interface ExportFile {
  filename: string;
  base64: string;
  groups: number;
  draws: number;
  emptyGroups: number;
}

export function LotteryStatisticsExport({ groups, years }: {
  groups: readonly StatisticsGroup[];
  years: readonly string[];
}) {
  const { api } = useAuth();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set<string>());
  const [selectedYears, setSelectedYears] = useState(() => new Set(years));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<(Omit<ExportFile, "base64"> & { url: string }) | null>(null);
  const request = useRef<AbortController | null>(null);
  const fileUrl = useRef<string | null>(null);

  useEffect(() => () => {
    request.current?.abort();
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
  }, []);

  const options = useMemo(() => [...groups].sort((a, b) =>
    a.lottery.localeCompare(b.lottery, "th") || a.position.localeCompare(b.position, "th"),
  ), [groups]);
  const shown = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th");
    return options.filter((group) => `${group.lottery} ${group.position}`.toLocaleLowerCase("th").includes(query));
  }, [options, search]);
  const chosen = options.filter((group) => selected.has(statisticsGroupKey(group.lottery, group.position)));
  const lotteryCount = new Set(chosen.map((group) => group.lottery)).size;
  const missingCount = chosen.filter((group) => !group.years.some((year) => selectedYears.has(year))).length;

  function clearFile() {
    setError(null);
    setFile(null);
    if (fileUrl.current) URL.revokeObjectURL(fileUrl.current);
    fileUrl.current = null;
  }

  function toggleGroup(key: string) {
    clearFile();
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function exportFile() {
    if (busy || !chosen.length || !selectedYears.size) return;
    clearFile();
    setBusy(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const result = await api<ExportFile>("/api/lottery/statistics-export", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({
          groups: chosen.map(({ lottery, position }) => ({ lottery, position })),
          years: [...selectedYears].sort(),
        }),
      });
      if (controller.signal.aborted) return;
      const bytes = Uint8Array.from(atob(result.base64), (char) => char.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }));
      fileUrl.current = url;
      setFile({ url, filename: result.filename, groups: result.groups, draws: result.draws, emptyGroups: result.emptyGroups });
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "สร้างไฟล์ไม่สำเร็จ กรุณาลองใหม่");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {process.env.NEXT_PUBLIC_STATISTICS_PREVIEW_LABEL && (
        <Alert tone="info">{process.env.NEXT_PUBLIC_STATISTICS_PREVIEW_LABEL}</Alert>
      )}
      <p className="muted text-[13px]">รวมสถิติ 2 ตัวไว้ใน Excel ไฟล์เดียว: สรุปงวดจริง · ความถี่เลข 00–99 · ความถี่หลักสิบและหลักหน่วย</p>
      <p className="dim text-[12px]">ข้อมูลที่มี: {new Set(options.map((group) => group.lottery)).size} หวย · {options.length} กลุ่ม · {years.length} ปี</p>
      <fieldset disabled={busy} className="space-y-2">
        <legend className="field-label">ปีข้อมูลที่ใช้คำนวณสถิติ</legend>
        <div className="flex flex-wrap gap-1.5">
          {years.map((year) => (
            <label key={year} className={`chip cursor-pointer${selectedYears.has(year) ? " chip-active" : ""}`}>
              <input type="checkbox" className="mr-1.5 accent-[var(--accent)]" checked={selectedYears.has(year)} onChange={() => {
                clearFile();
                setSelectedYears((current) => {
                  const next = new Set(current);
                  if (next.has(year)) next.delete(year);
                  else next.add(year);
                  return next;
                });
              }} />
              ปี 25{year}
            </label>
          ))}
        </div>
        <p className="dim text-[12px]">นับเฉพาะผลจริงในปีที่เลือก ไม่นับวันหยุดและช่องที่ยังไม่มีผล</p>
      </fieldset>

      <fieldset disabled={busy} className="min-w-0 space-y-2">
        <legend className="field-label">เลือกหวยและตำแหน่ง (เลือกได้หลายตัว)</legend>
        <label className="block">
          <span className="sr-only">ค้นหาหวยหรือตำแหน่ง</span>
          <input className="field w-full" type="search" placeholder="ค้นหาหวยหรือตำแหน่ง…" value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <button type="button" className="btn btn-ghost" disabled={!shown.length} onClick={() => {
            clearFile();
            setSelected((current) => new Set([...current, ...shown.map((group) => statisticsGroupKey(group.lottery, group.position))]));
          }}>{search.trim() ? `เลือกผลค้นหาทั้งหมด (${shown.length})` : `เลือกทั้งหมด (${shown.length})`}</button>
          <button type="button" className="btn btn-ghost" disabled={!selected.size} onClick={() => { clearFile(); setSelected(new Set()); }}>ล้างที่เลือกทั้งหมด</button>
        </div>
        <div className="max-h-[280px] overflow-y-auto rounded-xl border" style={{ borderColor: "var(--line)" }}>
          {shown.length ? shown.map((group) => {
            const key = statisticsGroupKey(group.lottery, group.position);
            const available = group.years.some((year) => selectedYears.has(year));
            return (
              <label key={key} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 border-b px-3 py-2 last:border-b-0" style={{ borderColor: "var(--divider)" }}>
                <input type="checkbox" className="size-4 flex-none accent-[var(--accent)]" checked={selected.has(key)} onChange={() => toggleGroup(key)} />
                <span className="min-w-0 text-[13px]">
                  {group.flag} {group.lottery} · {group.position}
                  {!available ? <span className="dim block text-[11px]">ไม่มีข้อมูลในปีที่เลือก</span> : null}
                </span>
              </label>
            );
          }) : <p className="muted p-4 text-center text-[13px]">ไม่พบหวยที่ค้นหา</p>}
        </div>
      </fieldset>

      <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <p className="text-[13px] font-semibold" aria-live="polite">เลือกแล้ว {lotteryCount} หวย · {chosen.length} กลุ่ม · {selectedYears.size} ปี</p>
        {missingCount ? <p className="muted text-[12px]">{missingCount} กลุ่มไม่มีข้อมูลในปีที่เลือก ไฟล์จะระบุไว้ในชีตสรุป</p> : null}
        {!selectedYears.size ? <p className="muted text-[12px]">เลือกปีข้อมูลอย่างน้อย 1 ปี</p> : null}
        <button type="button" className="btn btn-primary w-full" disabled={busy || !chosen.length || !selectedYears.size} onClick={() => void exportFile()}>
          {busy ? "กำลังสร้าง Excel…" : "ดาวน์โหลด Excel (.xlsx)"}
        </button>
        {error ? <Alert tone="error">{error}</Alert> : null}
        {file ? <div role="status" className="space-y-1 text-[13px]">
          <p>สร้างไฟล์แล้ว · {file.groups} กลุ่ม · {file.draws.toLocaleString("th-TH")} งวดจริง</p>
          {file.emptyGroups ? <p className="muted text-[12px]">{file.emptyGroups} กลุ่มไม่มีงวดจริง ดูสถานะในชีตสรุป</p> : null}
          <a className="font-semibold underline" href={file.url} download={file.filename}>ดาวน์โหลดไฟล์อีกครั้ง</a>
        </div> : null}
      </div>
    </div>
  );
}
