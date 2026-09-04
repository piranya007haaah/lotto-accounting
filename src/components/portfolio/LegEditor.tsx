"use client";

/**
 * แผงแก้ขา — **ตั้งใจให้มีแค่ 3 อย่าง**: ชุดเลขที่แทง · เรตจ่าย · เงินแทงต่อตัว
 *
 * ทำไมเหลือเท่านี้: ของเดิมมีครบทุกปุ่ม (เพิ่ม/ลบขา · เปลี่ยนสูตร · เลือกอันดับ · ชื่อพอร์ต ·
 * ทุน) แล้วหน้าจอแน่นจนหาสิ่งที่อยากแก้จริง ๆ ไม่เจอ — สามอย่างนี้คือของที่แก้บ่อยทุกงวด
 * ที่เหลือแก้ปีละครั้งและยังทำได้ที่แอปเดิม ⇒ ตัดออกจนกว่าจะมีคนคิดถึงมันจริง ๆ
 *
 * ⚠️ แก้ที่นี่ = แก้ "สำเนาที่กำลังแก้" เท่านั้น ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึกของทั้งหน้า
 */

import { formatBahtShort } from "@/lib/format";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { NumberField } from "./fields";
import { ManualNumbers } from "./ManualNumbers";
import { isMonthly, legCost, legDigits, legModeText } from "./leg-utils";

export function LegEditor({
  leg,
  index,
  onChange,
}: {
  leg: PortfolioLegConfig;
  index: number;
  onChange: (next: PortfolioLegConfig) => void;
}) {
  const digits = legDigits(leg);
  const usesFormula = leg.mode !== "manual";

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
    </section>
  );
}
