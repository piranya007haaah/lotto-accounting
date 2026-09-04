"use client";

/**
 * แผงแก้ขา — ชุดเลขที่แทง · เรตจ่าย · เงินแทงต่อตัว (+ ปุ่มลบขา)
 *
 * ยังไม่มีในนี้โดยตั้งใจ: เปลี่ยนหวย/ตำแหน่ง/ปี · เปลี่ยนสูตร/อันดับ — ของเดิมมีครบทุกปุ่ม
 * แล้วหน้าจอแน่นจนหาสิ่งที่อยากแก้จริง ๆ ไม่เจอ · เปลี่ยนหวย/ปี = **คนละขากันแล้ว**
 * (เลข ต้นทุน ผลย้อนหลัง คนละชุดหมด) ⇒ ลบขาแล้วเพิ่มใหม่ ไม่ใช่แก้ทับ
 *
 * ⚠️ แก้ที่นี่ = แก้ "สำเนาที่กำลังแก้" เท่านั้น ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึกของทั้งหน้า
 */

import { useEffect, useState } from "react";
import { formatBahtShort } from "@/lib/format";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { NumberField } from "./fields";
import { ManualNumbers } from "./ManualNumbers";
import { isMonthly, legCost, legDigits, legModeText } from "./leg-utils";

export function LegEditor({
  leg,
  index,
  onChange,
  onRemove,
}: {
  leg: PortfolioLegConfig;
  index: number;
  onChange: (next: PortfolioLegConfig) => void;
  /** ไม่ส่งมา = ลบขาไม่ได้ (เช่นคนที่ไม่ใช่ผู้ดูแล) */
  onRemove?: () => void;
}) {
  const digits = legDigits(leg);
  const usesFormula = leg.mode !== "manual";
  // ลบขา = 2 จังหวะเหมือนลบพอร์ต — เลขที่พิมพ์มาทั้งชุดหายในคลิกเดียวเจ็บเกินไป
  const [confirming, setConfirming] = useState(false);
  // ⚠️ ลบขากลางลิสต์แล้ว index ของขาที่เหลือจะเลื่อนขึ้นมาแทน — ถ้าบังเอิญได้ key เดิม
  // (พอร์ตที่มีหวย/ตำแหน่งเดียวกัน 2 ขา) React จะใช้คอมโพเนนต์ตัวเดิมต่อ แล้วปุ่ม
  // "ลบขา" ที่ง้างไว้จะค้างอยู่บนขาใหม่ ⇒ แตะพลาดทีเดียวขาถัดไปหายอีกขา
  useEffect(() => setConfirming(false), [leg]);

  return (
    <section className="card space-y-2.5 px-3.5 py-3">
      <div>
        <p className="truncate text-[13px] font-semibold">
          <span className="dim tnum mr-1.5">{index + 1}.</span>
          {leg.group_label}
        </p>
        {/* หวย/ตำแหน่ง/ปี เปลี่ยนไม่ได้ — เปลี่ยนแล้วมันคือคนละขากัน (เลข ต้นทุน ผลย้อนหลัง
            คนละชุดทั้งหมด) ⇒ บอกไว้ตรง ๆ ว่าต้องไปทำที่แอปเดิม ไม่ใช่ปล่อยให้หาปุ่มไม่เจอ */}
        <p className="dim mt-0.5 text-[10.5px]">
          ทดสอบปี 25{leg.test_year} · {legModeText(leg)} · {digits} หลัก
          {usesFormula ? ` · เลขมาจากสูตร ${leg.formula_name ?? "—"}` : ""}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="แทงตัวละ (บาท)"
          value={leg.bet_per_number}
          min={0}
          onChange={(value) => onChange({ ...leg, bet_per_number: value })}
        />
        <NumberField
          label="เรตจ่าย"
          value={leg.payout_rate}
          min={1}
          onChange={(value) => onChange({ ...leg, payout_rate: value })}
        />
      </div>

      {usesFormula ? (
        // ขาที่ใช้สูตรเลือกเลขให้ — แก้เลขตรงนี้ไม่ได้ เพราะสูตรจะคำนวณทับทุกครั้งที่รัน
        <p className="dim text-[10.5px] leading-relaxed">
          ขานี้ให้สูตรเลือกเลขให้ ({leg.n_bet} ตัว) — เปลี่ยนสูตร/อันดับได้ที่แอปเดิม
        </p>
      ) : (
        <ManualNumbers leg={leg} onChange={onChange} />
      )}

      <p className="dim text-[10.5px]">
        ต้นทุนงวดละ {formatBahtShort(legCost(leg))} บ. ({leg.n_bet} เลข ×{" "}
        {formatBahtShort(leg.bet_per_number)} บ.
        {isMonthly(leg) ? " · คิดจากเดือนที่แทงเยอะสุด" : ""})
      </p>

      {onRemove ? (
        confirming ? (
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[11.5px] leading-tight font-semibold">ลบขานี้ออกจากพอร์ต?</span>
            <button
              type="button"
              className="btn btn-ghost flex-none py-1.5 text-[12px]"
              onClick={() => setConfirming(false)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn flex-none py-1.5 text-[12px] font-semibold"
              style={{ background: "var(--color-money-in)", color: "#fff" }}
              onClick={onRemove}
            >
              ลบขา
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-ghost py-1.5 text-[12px]"
            onClick={() => setConfirming(true)}
          >
            🗑️ ลบขานี้
          </button>
        )
      ) : null}
    </section>
  );
}
