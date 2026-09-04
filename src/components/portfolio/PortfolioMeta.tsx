"use client";

/**
 * ตั้งค่าระดับ "ทั้งพอร์ต" — ชื่อ · ทุนเริ่มต้น · ติ๊กว่าใช้จริง · ปุ่มลบ
 *
 * เดิมหน้านี้แก้ได้แค่ระดับ "ขา" เพราะพอร์ตทั้งหมดถูกนำเข้ามาจากแอปเดิม ⇒ ชื่อ/ทุน
 * แทบไม่มีใครแตะ · พอสร้างพอร์ตใหม่ที่นี่ได้แล้วมันจำเป็น (พอร์ตใหม่ยังไม่มีชื่อ/ทุน)
 *
 * ⚠️ ปุ่มลบเป็น **2 จังหวะ** ตั้งใจ — กดพลาดครั้งเดียวแล้วพอร์ตหายทั้งก้อนกู้คืนไม่ได้
 * (ไม่ใช้ `confirm()` ของเบราว์เซอร์ เพราะใน LIFF/เว็บวิวบางตัวมันไม่เด้ง)
 */

import { useEffect, useState } from "react";
import type { PortfolioConfig } from "@/lib/lottery/portfolio-config";
import { NumberField, TextField } from "./fields";

export function PortfolioMeta({
  name,
  capital,
  config,
  legCount,
  isNew,
  deleting,
  onChangeName,
  onChangeCapital,
  onChangeConfig,
  onDelete,
}: {
  name: string;
  capital: number;
  config: PortfolioConfig;
  legCount: number;
  isNew: boolean;
  deleting: boolean;
  onChangeName: (value: string) => void;
  onChangeCapital: (value: number) => void;
  onChangeConfig: (next: PortfolioConfig) => void;
  onDelete: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const active = Boolean(config.is_active);

  // สลับไปพอร์ตอื่นแล้วต้องเริ่มนับหนึ่งใหม่ — ปุ่มลบที่ง้างค้างไว้จากพอร์ตก่อนหน้า
  // ต้องไม่ไปโผล่บนพอร์ตใหม่ (แตะพลาดทีเดียว = ลบผิดตัว กู้ไม่ได้)
  useEffect(() => setConfirming(false), [name]);

  return (
    <section className="card space-y-2.5 px-3.5 py-3">
      <TextField
        label="ชื่อพอร์ต"
        value={name}
        onChange={onChangeName}
        placeholder="เช่น Racer"
        help={name.trim() ? undefined : "ต้องมีชื่อถึงจะบันทึกได้"}
      />

      <NumberField
        label="ทุนเริ่มต้น (บาท)"
        value={capital}
        min={0}
        onChange={onChangeCapital}
        help="ใช้วาดเส้นทุนและคิด Max DD — ไม่มีผลกับการเลือกเลข"
      />

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={active}
          onChange={(event) => onChangeConfig({ ...config, is_active: event.target.checked })}
        />
        <span className="text-[12.5px] leading-tight font-semibold">
          ⭐ ใช้จริง
          <span className="dim block text-[10.5px] font-normal">
            พอร์ตที่รายงาน LINE และหน้านี้หยิบขึ้นมาก่อน
          </span>
        </span>
      </label>

      {isNew ? (
        <p className="dim text-[10.5px] leading-relaxed">
          พอร์ตใหม่ยังไม่ได้บันทึก — เพิ่มขาให้ครบแล้วกด “บันทึก” ทีเดียว
        </p>
      ) : confirming ? (
        <div className="flex items-center gap-2">
          <span className="flex-1 text-[12px] leading-tight font-semibold">
            ลบ “{name}” ทั้งพอร์ต?
            <span className="dim block text-[10.5px] font-normal">
              ขา {legCount} ขาและตัวเลขที่เก็บไว้หายถาวร กู้คืนไม่ได้
            </span>
          </span>
          <button
            type="button"
            className="btn btn-ghost flex-none py-2 text-[12.5px]"
            disabled={deleting}
            onClick={() => setConfirming(false)}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            className="btn flex-none py-2 text-[12.5px] font-semibold"
            style={{ background: "var(--color-money-in)", color: "#fff" }}
            disabled={deleting}
            onClick={onDelete}
          >
            {deleting ? "กำลังลบ..." : "ลบเลย"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-ghost py-2 text-[12.5px]"
          onClick={() => setConfirming(true)}
        >
          🗑️ ลบพอร์ตนี้
        </button>
      )}
    </section>
  );
}
