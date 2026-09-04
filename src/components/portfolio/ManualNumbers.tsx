"use client";

/**
 * ช่องตั้ง "ชุดเลขที่แทง" ของขาโหมด ✍️ กำหนดเลขเอง — ย้ายมาจาก `page_utils.manual_numbers_ui`
 *
 * 2 แบบเหมือนฝั่ง Streamlit:
 *   🗓️ ทั้งปี      — ชุดเดียวใช้ทั้งปี (ของเดิม)
 *   📆 แยกรายเดือน — เดือนไหนใช้เลขอะไร
 *
 * ⚠️⚠️ **เดือนที่ไม่ได้เลือก / ไม่ได้ใส่เลข = ไม่แทงเดือนนั้น** (ต้นทุน 0 · กำไรเดือนนั้น 0)
 * ไม่ใช่ "ตกลงมาใช้เลขทั้งปีแทน" — เข้าใจผิดข้อนี้แล้วพอร์ตจะดูเหมือนขาดทุนหายไปเฉย ๆ
 * ⇒ หน้าจอต้องเขียนบอกตรง ๆ ทุกครั้ง ไม่ใช่ซ่อนไว้ในหัวคนเขียนโค้ด
 */

import { useState } from "react";
import { Chip } from "@/components/ui";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import {
  ALL_MONTHS,
  bettingMonths,
  isMonthly,
  joinNumbers,
  legDigits,
  monthName,
  parseNumbers,
  setMonthlyNumbers,
  setYearNumbers,
} from "./leg-utils";

/** บรรทัดใต้ช่องกรอก — บอกว่าที่พิมพ์ไปกลายเป็นเลขกี่ตัว และอะไรที่อ่านไม่ออก */
function ParseHint({ text, digits }: { text: string; digits: number }) {
  const parsed = parseNumbers(text, digits);
  return (
    <p className="dim mt-1 text-[10.5px] leading-relaxed">
      {parsed.numbers.length > 0 ? `✅ ${parsed.numbers.length} ตัว` : `⚪ ยังไม่ใส่เลข`}
      {parsed.duplicates > 0 ? ` · ตัดตัวซ้ำออก ${parsed.duplicates}` : ""}
      {parsed.invalid.length > 0 ? (
        <span style={{ color: "var(--color-money-in)" }}>
          {" "}
          · ใช้ไม่ได้ {parsed.invalid.slice(0, 6).join(" ")}
          {parsed.invalid.length > 6 ? " …" : ""}
        </span>
      ) : null}
    </p>
  );
}

function NumbersBox({
  value,
  onChange,
  onBlur,
  digits,
  disabled,
  rows = 3,
}: {
  value: string;
  onChange: (text: string) => void;
  onBlur: () => void;
  digits: number;
  disabled?: boolean;
  rows?: number;
}) {
  return (
    <>
      <textarea
        className="field tnum leading-relaxed"
        rows={rows}
        inputMode="numeric"
        disabled={disabled}
        placeholder={digits === 3 ? "เช่น 123 456 789" : "เช่น 45 07 88"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
      <ParseHint text={value} digits={digits} />
    </>
  );
}

export function ManualNumbers({
  leg,
  onChange,
  disabled,
}: {
  leg: PortfolioLegConfig;
  onChange: (next: PortfolioLegConfig) => void;
  disabled?: boolean;
}) {
  const digits = legDigits(leg);
  const monthly = isMonthly(leg);

  // ข้อความดิบที่พิมพ์อยู่ — แยกจากตัวขา เพราะระหว่างพิมพ์ยังไม่เป็นเลขที่ใช้ได้
  // (ตัวขาเก็บ "ผลที่แปลงแล้ว" เสมอ ⇒ ต้นทุน/n_bet ที่โชว์ตรงกับที่จะบันทึกจริง)
  const [yearText, setYearText] = useState(() => joinNumbers(leg.manual_nums));
  const [monthText, setMonthText] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {};
    for (const month of ALL_MONTHS) {
      initial[month] = joinNumbers(leg.manual_months?.[String(month)] ?? []);
    }
    return initial;
  });
  const filled = bettingMonths(leg);
  const [selected, setSelected] = useState<number[]>(() => (filled.length > 0 ? filled : ALL_MONTHS));
  const [active, setActive] = useState<number>(() => filled[0] ?? 1);

  /** ดันข้อความของทุกเดือนที่เลือกกลับเข้าตัวขา (เดือนที่ไม่ได้เลือก = ไม่ส่งเลขไป = ไม่แทง) */
  const pushMonths = (texts: Record<number, string>, months: number[]) => {
    const map: Record<string, string[]> = {};
    for (const month of months) {
      map[String(month)] = parseNumbers(texts[month] ?? "", digits).numbers;
    }
    onChange(setMonthlyNumbers(leg, map));
  };

  const switchMode = (toMonthly: boolean) => {
    if (toMonthly) {
      // ยกชุดเลขทั้งปีไปเป็นค่าเริ่มต้นของทุกเดือน — ไม่ใช่เริ่มจากศูนย์ให้พิมพ์ใหม่ 12 รอบ
      const seed = joinNumbers(leg.manual_nums);
      const texts: Record<number, string> = {};
      for (const month of ALL_MONTHS) texts[month] = monthText[month] || seed;
      setMonthText(texts);
      setSelected(ALL_MONTHS);
      setActive(1);
      pushMonths(texts, ALL_MONTHS);
    } else {
      // เคยตั้งรายเดือนแล้วสลับกลับ: ถ้าช่อง "ทั้งปี" ยังว่าง ให้ยกเลขรวมทุกเดือนมาตั้งต้น
      // ไม่งั้นเลขที่พิมพ์มาทั้งหมดหายไปเงียบ ๆ ตอนกดสลับโหมด
      const text = yearText.trim() ? yearText : joinNumbers(leg.manual_nums);
      setYearText(text);
      onChange(setYearNumbers(leg, parseNumbers(text, digits).numbers));
    }
  };

  const toggleMonth = (month: number) => {
    const next = selected.includes(month)
      ? selected.filter((item) => item !== month)
      : [...selected, month].sort((a, b) => a - b);
    setSelected(next);
    if (!next.includes(active) && next.length > 0) setActive(next[0]);
    pushMonths(monthText, next);
  };

  const applyToAll = () => {
    const source = monthText[active] ?? "";
    const texts = { ...monthText };
    for (const month of selected) texts[month] = source;
    setMonthText(texts);
    pushMonths(texts, selected);
  };

  const skipped = ALL_MONTHS.filter((month) => !selected.includes(month));
  const emptyPicked = selected.filter((month) => parseNumbers(monthText[month] ?? "", digits).numbers.length === 0);

  return (
    <div>
      <p className="field-label">ชุดเลขนี้ใช้กับ</p>
      <div className="flex gap-1.5">
        <Chip active={!monthly} onClick={() => !disabled && switchMode(false)}>
          🗓️ ทั้งปี
        </Chip>
        <Chip active={monthly} onClick={() => !disabled && switchMode(true)}>
          📆 แยกรายเดือน
        </Chip>
      </div>

      {!monthly ? (
        <div className="mt-2">
          <p className="field-label">เลข {digits} หลัก (เว้นวรรค / คอมม่า / ติดกันก็ได้)</p>
          <NumbersBox
            value={yearText}
            digits={digits}
            disabled={disabled}
            rows={3}
            onChange={(text) => {
              setYearText(text);
              onChange(setYearNumbers(leg, parseNumbers(text, digits).numbers));
            }}
            onBlur={() => setYearText(joinNumbers(parseNumbers(yearText, digits).numbers))}
          />
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <div>
            <p className="field-label">เดือนที่จะแทง</p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_MONTHS.map((month) => (
                <Chip key={month} active={selected.includes(month)} onClick={() => !disabled && toggleMonth(month)}>
                  {monthName(month)}
                </Chip>
              ))}
            </div>
            <p className="dim mt-1 text-[10.5px] leading-relaxed">
              เดือนที่ไม่ได้เลือก = <b>ไม่แทงเดือนนั้นเลย</b> (ต้นทุน 0 · กำไรเดือนนั้น 0 · เส้นทุนแบนราบ)
              — ไม่ใช่ตกลงไปใช้เลขของทั้งปีแทน
            </p>
          </div>

          {selected.length === 0 ? (
            <p className="text-[12px]" style={{ color: "var(--color-money-in)" }}>
              ยังไม่ได้เลือกเดือนไหนเลย — ขานี้จะไม่แทงทั้งปี
            </p>
          ) : (
            <>
              <div>
                <p className="field-label">แก้เลขของเดือน</p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.map((month) => {
                    const count = parseNumbers(monthText[month] ?? "", digits).numbers.length;
                    return (
                      <Chip key={month} active={active === month} onClick={() => setActive(month)}>
                        {monthName(month)} · {count > 0 ? `${count} ตัว` : "ว่าง"}
                      </Chip>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="field-label">
                  เลข {digits} หลัก ของเดือน {monthName(active)}
                </p>
                <NumbersBox
                  value={monthText[active] ?? ""}
                  digits={digits}
                  disabled={disabled}
                  rows={3}
                  onChange={(text) => {
                    const texts = { ...monthText, [active]: text };
                    setMonthText(texts);
                    pushMonths(texts, selected);
                  }}
                  onBlur={() => {
                    const cleaned = joinNumbers(parseNumbers(monthText[active] ?? "", digits).numbers);
                    setMonthText((current) => ({ ...current, [active]: cleaned }));
                  }}
                />
                {selected.length > 1 ? (
                  <button
                    type="button"
                    className="btn btn-ghost mt-1.5 w-full py-2 text-[12.5px]"
                    disabled={disabled || !(monthText[active] ?? "").trim()}
                    onClick={applyToAll}
                  >
                    📋 ใช้เลขชุดนี้กับทุกเดือนที่เลือก
                  </button>
                ) : null}
              </div>
            </>
          )}

          {emptyPicked.length > 0 || skipped.length > 0 ? (
            <p className="dim text-[10.5px] leading-relaxed">
              ⚪ ไม่แทง:{" "}
              {[...skipped, ...emptyPicked]
                .sort((a, b) => a - b)
                .map((month) => monthName(month))
                .join(" · ")}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
