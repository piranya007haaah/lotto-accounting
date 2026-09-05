"use client";

/**
 * ตารางรายวันของ **ขาเดียว** ตลอดเดือน — ท้ายป๊อปอัปรายงานรายขา
 *
 * รูปเดียวกับตารางในการ์ด LINE (`monthBubble`) แต่กรองเหลือตำแหน่งของขานี้ตำแหน่งเดียว
 * ⇒ ตอบคำถาม "เดือนนี้ขานี้เป็นยังไง" โดยไม่ต้องไปเปิด LINE ย้อนดู
 *
 * ⚠️ ตัวเลขมาจาก `monthTable()` ตัวเดียวกับที่การ์ดใช้ ⇒ เลขบนเว็บกับใน LINE ตรงกันเสมอ
 * ห้ามคิด pnl เองใหม่ที่นี่
 *
 * ⚠️ สีเขียว/แดงแยกไม่ออกด้วยตาบอดสี ⇒ ช่องที่ถูกเป็น **ตัวหนา** ด้วยเสมอ
 *    (กติกาเดียวกับการ์ด LINE) สีเป็นของแถม
 */

import { useMemo, useState } from "react";
import { Chip, SectionTitle } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { monthTable, yearBeOf } from "@/lib/lottery/day-result";
import type { LotteryPortfolio } from "@/lib/lottery/portfolio-config";
import type { DatasetSequence, ReplayResult } from "@/lib/lottery/portfolio-engine";
import type { PortfolioLeg } from "@/lib/types";

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

/** ปี ค.ศ. ของขา — `test_year` เก็บเป็น พ.ศ. 2 หลัก */
function ceYearOf(yearBe: string): number {
  return 2500 + Number(yearBe) - 543;
}

export function LegMonthTable({
  portfolio,
  sequences,
  replay,
  leg,
}: {
  portfolio: LotteryPortfolio;
  sequences: readonly DatasetSequence[];
  /** ส่งมาแล้วจะไม่ replay ซ้ำ (เปิดป๊อปอัปทีละขา แต่ replay ทั้งพอร์ตทุกครั้งจะหน่วง) */
  replay?: ReplayResult;
  leg: PortfolioLeg;
}) {
  const testYear = String(portfolio.config.legs?.[0]?.test_year ?? "");
  const ce = testYear ? ceYearOf(testYear) : new Date().getUTCFullYear();

  /** เดือนที่มีผลจริงของขานี้ — เดือนที่ยังไม่ถึงไม่ต้องมีชิปให้กด */
  const months = useMemo(() => {
    if (!leg.lottery) return [];
    const out: { month: number; table: ReturnType<typeof monthTable> }[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const table = monthTable({
        portfolio,
        sequences,
        replay,
        lottery: leg.lottery,
        date: new Date(Date.UTC(ce, month - 1, 1)),
      });
      if (table && table.days.length > 0) out.push({ month, table });
    }
    return out;
  }, [ce, leg.lottery, portfolio, replay, sequences]);

  // ดีฟอลต์ = เดือนล่าสุดที่มีผล (คำถามคือ "เดือนนี้เป็นยังไง" ไม่ใช่ ม.ค.)
  const [picked, setPicked] = useState<number | null>(null);
  const current = months.find((m) => m.month === picked) ?? months[months.length - 1];
  if (!current?.table) return null;

  const column = current.table.columns.find((c) => c.position === leg.position);
  if (!column) return null;

  const draws = column.hits + column.misses;
  const rows = current.table.days.map((day) => column.cells[day - 1]);

  return (
    <div>
      <SectionTitle>ผลรายวันของขานี้</SectionTitle>

      {months.length > 1 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {months.map((m) => (
            <Chip key={m.month} active={m.month === current.month} onClick={() => setPicked(m.month)}>
              {TH_MONTHS[m.month - 1]}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="tnum w-full text-[12px]">
          <thead>
            <tr className="dim text-[10.5px]">
              <th className="w-10 py-1 text-left font-semibold">วัน</th>
              <th className="py-1 text-center font-semibold">{column.position}</th>
              <th className="py-1 text-right font-semibold">กำไร</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cell) => {
              const hit = cell.status === "hit";
              const miss = cell.status === "miss";
              return (
                <tr key={cell.day} style={{ borderTop: "1px solid var(--divider)" }}>
                  <td className="dim py-1 text-[11px]">{cell.day}</td>
                  <td
                    className="py-1 text-center"
                    style={{
                      color: hit ? "var(--color-money-out)" : miss ? "var(--color-money-in)" : "var(--dim)",
                      fontWeight: hit ? 700 : 400,
                    }}
                  >
                    {cell.draw ?? "—"}
                  </td>
                  <td
                    className="py-1 text-right text-[11px]"
                    style={{ color: cell.pnl >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
                  >
                    {cell.pnl === 0 ? "—" : formatSigned(cell.pnl)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div
        className="mt-2 rounded-xl px-2.5 py-2"
        style={{ background: "var(--subtle)" }}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="dim text-[11px]">
            ถูก {column.hits} · ไม่ถูก {column.misses}
            {draws > 0 ? ` · ${((column.hits / draws) * 100).toFixed(1)}%` : ""}
          </span>
          <span
            className="tnum text-[14px] font-bold"
            style={{ color: column.pnl >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
          >
            {formatSigned(column.pnl)}
          </span>
        </div>
        <p className="dim mt-0.5 text-[10px] leading-relaxed">
          ลงเงินไปทั้งเดือน {formatBahtShort(column.cost)} บ. · <b>ตัวหนา = ถูก</b> ·
          วันที่ไม่มีเลข = วันหยุด/ยังไม่มีผล (ไม่คิดต้นทุน)
        </p>
      </div>
    </div>
  );
}
