"use client";

/**
 * เวลาออกผลของแต่ละหวยในพอร์ต — เก็บที่ `config.schedule.lottery_times`
 *
 * เวลาไม่ได้มีไว้ตั้ง cron อย่างเดียว มันคือ **ลำดับของทุกอย่าง**: ฟอร์มกรอกผล
 * การ์ดที่ส่งเข้า LINE และรายงานฝั่ง Python เรียงหวยตามค่านี้ทั้งหมด
 * ⇒ หวยที่ออกก่อนอยู่บน ไล่ลงมาเหมือนที่เกิดจริง
 *
 * ⚠️ ตั้งใจให้เป็น **แถวเดียวจบต่อหวย** (ชื่อ + ช่องเวลา) ไม่มีหัวข้อ/คำอธิบายคั่น —
 * ของเดิมฝั่ง Streamlit กางเป็นฟอร์มใหญ่จนไม่มีใครอยากแตะ
 */

import { useMemo } from "react";
import type { PortfolioConfig, PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { minutesOf } from "@/lib/lottery/day-result";

/** {ชื่อหวย: "HH:MM"} ที่เก็บอยู่ตอนนี้ (คีย์ที่รูปแบบเพี้ยนถูกทิ้ง) */
function currentTimes(config: PortfolioConfig): Record<string, string> {
  const raw = config.schedule?.lottery_times;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw)) {
    const text = String(value ?? "").trim();
    if (/^\d{1,2}:\d{2}$/.test(text)) out[name] = text.padStart(5, "0");
  }
  return out;
}

export function ScheduleEditor({
  legs,
  config,
  onChange,
}: {
  legs: PortfolioLegConfig[];
  config: PortfolioConfig;
  onChange: (next: PortfolioConfig) => void;
}) {
  const times = currentTimes(config);

  // หวยที่อยู่ในพอร์ตจริง ๆ เท่านั้น เรียงตามเวลา (ยังไม่ตั้ง = ไปท้าย คงลำดับขาไว้)
  const lotteries = useMemo(() => {
    const seen = new Map<string, string>();
    for (const leg of legs) if (!seen.has(leg.lottery)) seen.set(leg.lottery, leg.flag ?? "🎰");
    const list = [...seen.entries()].map(([lottery, flag]) => ({ lottery, flag }));
    const order = new Map(list.map((item, i) => [item.lottery, i]));
    return list.sort(
      (a, b) =>
        minutesOf(times[a.lottery] ?? null) - minutesOf(times[b.lottery] ?? null) ||
        (order.get(a.lottery) ?? 0) - (order.get(b.lottery) ?? 0),
    );
  }, [legs, times]);

  const setTime = (lottery: string, value: string) => {
    const next = { ...times };
    // ล้างช่องว่าง = ลบคีย์ทิ้ง ไม่ใช่เก็บ "" ไว้ (ค่าว่างทำให้ลำดับเพี้ยนฝั่ง Python)
    if (value) next[lottery] = value;
    else delete next[lottery];
    onChange({ ...config, schedule: { ...(config.schedule ?? {}), lottery_times: next } });
  };

  if (lotteries.length === 0) return null;

  return (
    <section className="card space-y-1 px-3.5 py-3">
      <p className="field-label">⏰ เวลาออกผล</p>
      {lotteries.map(({ lottery, flag }) => (
        <div key={lottery} className="row flex items-center gap-2 py-1.5">
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold">
            {flag} {lottery}
          </span>
          <input
            className="field tnum w-[104px] flex-none px-2 py-1.5 text-center text-[12.5px]"
            type="time"
            value={times[lottery] ?? ""}
            onChange={(event) => setTime(lottery, event.target.value)}
          />
        </div>
      ))}
      <p className="dim pt-1 text-[10.5px] leading-relaxed">
        เรียงตามเวลาให้เอง — ลำดับนี้คือลำดับในฟอร์มกรอกผลและในการ์ดที่ส่งเข้า LINE
        · ปล่อยว่าง = ไม่ตั้งเวลา (ไปอยู่ท้ายสุด)
      </p>
    </section>
  );
}
