/**
 * มุมมอง "ถอนกำไรออกทุกเดือน" — ทุนกลับมาเริ่มที่ทุนตั้งต้นทุกต้นเดือน
 *
 * เจ้าของพอร์ตถอนกำไรออกทุกสิ้นเดือน ⇒ ต้นเดือนถัดไปเหลือทุนเท่าเดิมเสมอ ไม่ใช่
 * ทบไปเรื่อย ๆ อย่างที่ engine คิดให้ · เส้นทุนจริงของเขาจึงเป็น **ฟันเลื่อย**
 * ไม่ใช่เส้นที่ไต่ขึ้นเป็นล้าน
 *
 * ⚠️⚠️ **นี่เป็นการแปลง "ภาพ" เท่านั้น ไม่ใช่การคำนวณใหม่** — เงินแทงเป็นจำนวนบาทคงที่
 * ไม่ได้ผูกกับทุน ⇒ **กำไรทุกตัวเลขเท่าเดิมเป๊ะ** ทั้งรายเดือน รายขา อัตราถูก
 * ถอนหรือไม่ถอนก็ได้เท่ากัน · ที่เปลี่ยนคือ "ทุนต้นเดือน" กับ "ต้องมีเงินสำรองเท่าไหร่"
 *
 * ⚠️ ห้ามเอาเส้นฟันเลื่อยไปเข้า `computeRiskMetrics` — รอยตัดต้นเดือน (ตอนถอนเงินออก)
 * จะถูกนับเป็นวันที่ขาดทุนก้อนใหญ่ ทั้งที่เป็นการถอนกำไร ไม่ใช่แพ้
 */

import type { PortfolioSnapshot } from "@/lib/types";

/**
 * รีเซ็ตเส้นทุนกลับไปที่ทุนตั้งต้นทุกต้นเดือน
 *
 * ช่วงของเดือนต่อกันสนิท (`idxEnd` ของเดือนนี้ = `idxStart` ของเดือนถัดไป — ตรวจกับ
 * เฉลย Python แล้วทุกพอร์ต) ⇒ ไล่ทีละเดือนแล้วครอบคลุมทั้งเส้นพอดี
 */
export function applyMonthlyWithdrawal(snapshot: PortfolioSnapshot): PortfolioSnapshot {
  const values = snapshot.equity.values;
  const months = snapshot.monthly;
  const capital = snapshot.equity.capital;
  if (values.length === 0 || months.length === 0) return snapshot;

  const reset = [...values];
  /** ต่ำกว่าทุนตั้งต้นมากสุดที่เคยเจอ **ภายในเดือนใดเดือนหนึ่ง** = เงินที่ต้องทนไหว */
  let deepestDip = 0;

  for (const month of months) {
    const start = Math.min(Math.max(month.idxStart, 0), values.length - 1);
    const end = Math.min(Math.max(month.idxEnd, start), values.length - 1);
    const base = values[start] ?? 0;
    for (let i = start; i <= end; i += 1) {
      reset[i] = capital + ((values[i] ?? base) - base);
      const dip = capital - reset[i];
      if (dip > deepestDip) deepestDip = dip;
    }
  }

  const maxDrawdown = Math.trunc(deepestDip);
  return {
    ...snapshot,
    kpi: {
      ...snapshot.kpi,
      maxDrawdown,
      // ต้องทนได้ทั้ง "ร่วงลึกสุดในเดือน" และ "ช่วงแพ้ยาวที่สุด" — เอาตัวที่หนักกว่า
      reserveNeeded: Math.max(maxDrawdown, Math.abs(snapshot.kpi.worstLossRunAmount)),
    },
    // ถอนออกทุกเดือน ⇒ ทุกเดือนเริ่มที่ทุนตั้งต้นเท่ากันหมด (กำไรของเดือนไม่เปลี่ยน)
    monthly: months.map((month) => ({ ...month, capitalStart: capital })),
    equity: { ...snapshot.equity, values: reset },
  };
}
