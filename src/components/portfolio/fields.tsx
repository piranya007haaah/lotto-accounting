"use client";

/**
 * ช่องกรอกตัวเลขของหน้าพอร์ต
 *
 * เก็บค่าเป็น "ข้อความ" ระหว่างพิมพ์ — ถ้าผูกกับตัวเลขตรง ๆ พอลบเลขจนว่าง ค่าจะเด้ง
 * กลับเป็น 0 ทันทีแล้วพิมพ์ต่อไม่ได้ (กติกาเดียวกับ `NumberField` ของหน้า /formulas)
 */

import { useEffect, useState } from "react";

export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  suffix,
  disabled,
  help,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  suffix?: string;
  disabled?: boolean;
  help?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-1">
        <input
          className="field tnum font-semibold"
          inputMode="numeric"
          disabled={disabled}
          value={text}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, "");
            setText(next);
            const parsed = Number.parseInt(next, 10);
            if (!Number.isFinite(parsed)) return;
            if (parsed < min) return;
            if (max !== undefined && parsed > max) return;
            onChange(parsed);
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix ? <span className="dim flex-none text-[11px]">{suffix}</span> : null}
      </span>
      {help ? <span className="dim mt-1 block text-[10.5px] leading-tight">{help}</span> : null}
    </label>
  );
}

/** ช่องกรอกข้อความสั้น ๆ (ชื่อพอร์ต) — แยกจาก NumberField เพราะไม่ต้องกรองอักขระ */
export function TextField({
  label,
  value,
  onChange,
  maxLength = 200,
  placeholder,
  help,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  maxLength?: number;
  placeholder?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <input
        className="field"
        value={value}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {help ? <span className="dim mt-1 block text-[10.5px] leading-tight">{help}</span> : null}
    </label>
  );
}
