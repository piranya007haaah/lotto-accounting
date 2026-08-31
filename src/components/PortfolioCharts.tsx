"use client";

/**
 * กราฟของหน้าพอร์ต — วาดด้วย SVG เอง ไม่ลง chart library
 *
 * ทำไมไม่ลง lib: มีแค่ 2 รูปแบบ (เส้นทุน + บาร์รายเดือน) และต้องใช้ token สีของแอปนี้
 * ให้เหมือนหน้าอื่น ๆ · lib ที่เล็กสุดก็ยังใหญ่กว่าไฟล์นี้ทั้งไฟล์
 *
 * ⚠️ index ของ `values` = **วันปฏิทินนับจาก 1 ม.ค.** ไม่ใช่ "งวดที่" (วันหยุดก็มีจุด
 *    ของมัน เส้นแค่แบนราบ) ⇒ เส้นแบ่งเดือนต้องใช้ `monthDivs` ที่ฝั่ง Python ส่งมา
 *    ห้ามหารความยาวด้วย 12 เอง
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { formatBahtShort, formatSigned } from "@/lib/format";
import type { PortfolioMonth } from "@/lib/types";

const W = 620;
const H = 190;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 12;
const PAD_B = 20;

interface Hover {
  index: number;
  x: number;
  y: number;
  value: number;
  delta: number;
  label: string;
}

/** "12 Mar" จากเส้นแบ่งเดือนที่ฝั่ง Python ส่งมา — ไม่ต้องรู้ปีก็บอกวันได้ */
function dayLabel(index: number, monthDivs: [string, number][]): string {
  let label = "Jan";
  let start = 0;
  for (const [name, at] of monthDivs) {
    if (index >= at) {
      label = name;
      start = at;
    }
  }
  return `${index - start + 1} ${label}`;
}

/**
 * เส้นทุนรวมของพอร์ต — ซีรีส์เดียว จึงไม่ต้องมี legend (หัวข้อบอกอยู่แล้วว่าคืออะไร)
 * เส้นอ้างอิงแนวนอน = ทุนตั้งต้น: อยู่เหนือเส้น = กำไร ต่ำกว่า = ขาดทุน
 */
export function EquityChart({
  values,
  capital,
  monthDivs,
}: {
  values: number[];
  capital: number;
  monthDivs: [string, number][];
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);

  const geom = useMemo(() => {
    const n = values.length;
    const lo = Math.min(capital, ...values);
    const hi = Math.max(capital, ...values);
    const span = hi - lo || 1;
    const x = (i: number) => PAD_L + (i / Math.max(1, n - 1)) * (W - PAD_L - PAD_R);
    const y = (v: number) => PAD_T + (1 - (v - lo) / span) * (H - PAD_T - PAD_B);
    const line = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(2)},${y(v).toFixed(2)}`).join(" ");
    const base = H - PAD_B;
    return { n, x, y, line, area: `${line} L${x(n - 1).toFixed(2)},${base} L${x(0).toFixed(2)},${base} Z` };
  }, [values, capital]);

  const track = useCallback(
    (clientX: number) => {
      const box = boxRef.current?.getBoundingClientRect();
      if (!box || box.width === 0 || geom.n === 0) return;
      const ratio = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
      const index = Math.round(ratio * (geom.n - 1));
      const value = values[index];
      setHover({
        index,
        x: (geom.x(index) / W) * 100,
        y: (geom.y(value) / H) * 100,
        value,
        delta: value - (values[index - 1] ?? capital),
        label: dayLabel(index, monthDivs),
      });
    },
    [capital, geom, monthDivs, values],
  );

  if (values.length < 2) return null;

  const last = values[values.length - 1];
  const profit = last - capital;

  return (
    <div
      ref={boxRef}
      className="relative touch-pan-y select-none"
      onPointerMove={(event) => track(event.clientX)}
      onPointerDown={(event) => track(event.clientX)}
      onPointerLeave={() => setHover(null)}
    >
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="เส้นทุนรวมของพอร์ต">
        <defs>
          <linearGradient id="eqfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* เส้นแบ่งเดือน — หางบาง สีเดียวกับเส้นคั่นของแอป ไม่แย่งสายตาจากเส้นข้อมูล */}
        {monthDivs.map(([name, at]) => (
          <g key={`${name}-${at}`}>
            <line
              x1={geom.x(at)}
              x2={geom.x(at)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="var(--line)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text x={geom.x(at) + 3} y={H - 7} fontSize="10" fill="var(--dim)">
              {name}
            </text>
          </g>
        ))}

        {/* เส้นอ้างอิง = ทุนตั้งต้น */}
        <line
          x1={PAD_L}
          x2={W - PAD_R}
          y1={geom.y(capital)}
          y2={geom.y(capital)}
          stroke="var(--line-strong)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />

        <path d={geom.area} fill="url(#eqfill)" />
        <path
          d={geom.line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />

        {hover ? (
          <g>
            <line
              x1={geom.x(hover.index)}
              x2={geom.x(hover.index)}
              y1={PAD_T}
              y2={H - PAD_B}
              stroke="var(--dim)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            {/* วงแหวนสีพื้น 2px ให้จุดอ่านออกแม้ทับเส้น */}
            <circle cx={geom.x(hover.index)} cy={geom.y(hover.value)} r="5" fill="var(--card)" />
            <circle cx={geom.x(hover.index)} cy={geom.y(hover.value)} r="3.5" fill="var(--accent)" />
          </g>
        ) : (
          <>
            <circle cx={geom.x(geom.n - 1)} cy={geom.y(last)} r="5" fill="var(--card)" />
            <circle cx={geom.x(geom.n - 1)} cy={geom.y(last)} r="3.5" fill="var(--accent)" />
          </>
        )}
      </svg>

      {/* ป้ายค่าท้ายเส้นอันเดียว — ไม่ติดตัวเลขทุกจุด */}
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="dim text-[10.5px]">ทุนตั้งต้น {formatBahtShort(capital)}</span>
        <span className="tnum text-[11.5px] font-bold" style={{ color: "var(--text)" }}>
          {formatBahtShort(last)}{" "}
          <span style={{ color: profit >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}>
            ({formatSigned(profit)})
          </span>
        </span>
      </div>

      {hover ? (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg px-2 py-1 text-[11px] whitespace-nowrap"
          style={{
            left: `${hover.x}%`,
            top: `calc(${hover.y}% - 8px)`,
            background: "var(--ink-btn)",
            color: "var(--ink-btn-text)",
            boxShadow: "0 6px 16px rgb(22 36 61 / 0.24)",
          }}
        >
          <span style={{ opacity: 0.7 }}>{hover.label}</span> · {formatBahtShort(hover.value)}
          {hover.delta !== 0 ? ` (${formatSigned(hover.delta)})` : ""}
        </div>
      ) : null}
    </div>
  );
}

/**
 * กำไร/ขาดทุนรายเดือน — บาร์กางออกจาก "เส้นศูนย์" ตรงกลาง
 * ⚠️ สีเขียว/แดงคู่นี้แยกไม่ออกด้วยตาบอดสีเขียว-แดง (วัดแล้ว ΔE 5.2)
 *    ⇒ **ทิศทางของบาร์** (ขวา = กำไร · ซ้าย = ขาดทุน) + เครื่องหมาย +/− บนตัวเลข
 *    เป็นตัวบอกความหมายจริง สีเป็นแค่ของแถม
 */
export function MonthlyBars({ months }: { months: PortfolioMonth[] }) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.profit)));

  return (
    <div className="mt-1">
      {months.map((month) => {
        const width = (Math.abs(month.profit) / max) * 50;
        const up = month.profit >= 0;
        return (
          <div key={month.label} className="row py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{month.label}</span>
              <span
                className="tnum flex-none text-[13px] font-bold"
                style={{ color: up ? "var(--color-money-out)" : "var(--color-money-in)" }}
              >
                {formatSigned(month.profit)}
              </span>
            </div>
            <div className="relative mt-1.5 h-[10px]">
              <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--line-strong)" }} />
              <div
                className="absolute inset-y-0"
                style={{
                  background: up ? "var(--pastel-out)" : "var(--pastel-in)",
                  left: up ? "50%" : `${50 - width}%`,
                  width: `${width}%`,
                  borderRadius: up ? "0 5px 5px 0" : "5px 0 0 5px",
                }}
              />
            </div>
            <p className="dim mt-1 text-[10.5px]">
              ทุนต้นเดือน {formatBahtShort(month.capitalStart)} · ร่วงในเดือนสูงสุด{" "}
              <span className="tnum">{formatBahtShort(month.maxDd)}</span>
            </p>
          </div>
        );
      })}
    </div>
  );
}

/** แถบกำไรของขาหนึ่ง — กติกาเดียวกับบาร์รายเดือน (ทิศทาง = ความหมาย) */
export function ProfitBar({ value, max }: { value: number; max: number }) {
  const width = (Math.abs(value) / Math.max(1, max)) * 50;
  const up = value >= 0;
  return (
    <div className="relative h-[8px]">
      <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: "var(--line-strong)" }} />
      <div
        className="absolute inset-y-0"
        style={{
          background: up ? "var(--pastel-out)" : "var(--pastel-in)",
          left: up ? "50%" : `${50 - width}%`,
          width: `${width}%`,
          borderRadius: up ? "0 4px 4px 0" : "4px 0 0 4px",
        }}
      />
    </div>
  );
}
