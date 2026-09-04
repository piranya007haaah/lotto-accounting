/**
 * เติมผลหวยของ "วันหนึ่ง" ลงใน sequence ทั้งปี — **เติมเฉพาะช่องว่าง ห้ามทับ**
 *
 * ⚠️⚠️ index ของช่อง = **วันปฏิทินนับจาก 1 ม.ค.** ไม่ใช่ "งวดที่" (วันหยุดก็กินหนึ่งช่อง)
 * กติกาเดียวกับ `maskMonths` / `equity.values` / `db.mask_months` ฝั่ง Python —
 * ถ้าใครเปลี่ยนไปนับเป็นงวดจริง วันที่จะเลื่อนทั้งเส้นแบบเงียบ ๆ
 *
 * ⚠️⚠️ **ห้ามทับของเดิม** (นโยบายเดียวกับ `paste_import.plan_merge` ฝั่ง lottery-app):
 * ช่องที่มีค่าแล้วและค่าใหม่ไม่ตรง = conflict ⇒ **บล็อกทั้งก้อน** ไม่ใช่เขียนทับเงียบ ๆ
 * เหตุผลตรง ๆ: ตารางนี้มีคนเขียน 2 ทาง (หน้าเว็บ + `sync_to_supabase.py` ที่ส่ง
 * sequence เต็มปีมา upsert) ถ้าทางไหนทับได้ ผลที่อีกทางเพิ่งกรอกจะหายโดยไม่มีใครรู้
 */

/** ช่องว่าง = ขีดเท่าจำนวนหลัก ("--" สำหรับ 2 หลัก · "---" สำหรับ 3) */
export function blankCell(digits: number): string {
  return "-".repeat(digits);
}

/** true = ช่องนี้ยังไม่มีผล (ว่าง/ขีด) — `xx` (วันหยุด) **ถือว่ามีค่าแล้ว** */
export function isBlank(cell: string, digits: number): boolean {
  if (!cell || cell.length < digits) return true;
  return /^-+$/.test(cell);
}

export function cellAt(sequence: string, index: number, digits: number): string {
  const start = index * digits;
  if (start < 0 || start + digits > sequence.length) return "";
  return sequence.slice(start, start + digits);
}

/** จำนวนวันนับจาก 1 ม.ค. ของปีนั้น (1 ม.ค. = 0) — UTC ล้วน กัน DST ทำวันเลื่อน */
export function dayIndexOf(date: Date, ceYear: number): number {
  const start = Date.UTC(ceYear, 0, 1);
  const day = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((day - start) / 86_400_000);
}

export interface MergeResult {
  /** sequence ใหม่ (เท่าเดิมถ้าไม่มีอะไรเปลี่ยน) */
  sequence: string;
  /** true = มีการเขียนจริง */
  changed: boolean;
  /** ค่าที่มีอยู่แล้วและไม่ตรงกับที่ส่งมา — มีแม้ตัวเดียวก็ห้ามบันทึก */
  conflict: { index: number; existing: string; incoming: string } | null;
  /** true = ช่องนี้มีค่าเท่ากับที่ส่งมาอยู่แล้ว (กรอกซ้ำ ไม่ใช่ error) */
  alreadySame: boolean;
}

/**
 * เขียน `value` ลงช่องที่ `index` — คืน sequence ใหม่โดยไม่แตะช่องอื่นเลย
 *
 * sequence ที่สั้นกว่า index จะถูกเติมช่องว่างจนถึงตำแหน่งนั้น (ไม่ใช่ตัดให้สั้นลง)
 */
export function mergeCell(
  sequence: string,
  index: number,
  value: string,
  digits: number,
  /** true = **ทับของเดิมได้** — เฉพาะตอนที่คนกดสั่งแก้เองเท่านั้น ห้ามเปิดเป็นค่าเริ่มต้น */
  force = false,
): MergeResult {
  const clean = (value ?? "").trim();
  if (index < 0) {
    return { sequence, changed: false, conflict: null, alreadySame: false };
  }
  if (clean.length !== digits || !/^\d+$/.test(clean)) {
    throw new Error(`ผลหวยต้องเป็นตัวเลข ${digits} หลัก (ได้ "${value}")`);
  }

  const blank = blankCell(digits);
  // ⚠️ เติมด้วยช่องว่าง ไม่ใช่ตัดสตริง — ช่องที่ยังไม่ถึงต้องมีที่ของมันเสมอ
  let padded = sequence ?? "";
  const need = (index + 1) * digits;
  if (padded.length < need) padded += blank.repeat(Math.ceil((need - padded.length) / digits));

  const existing = cellAt(padded, index, digits);
  if (!isBlank(existing, digits)) {
    if (existing.toLowerCase() === clean.toLowerCase()) {
      return { sequence, changed: false, conflict: null, alreadySame: true };
    }
    if (!force) {
      return {
        sequence,
        changed: false,
        conflict: { index, existing, incoming: clean },
        alreadySame: false,
      };
    }
  }

  const start = index * digits;
  return {
    sequence: padded.slice(0, start) + clean + padded.slice(start + digits),
    changed: true,
    conflict: null,
    alreadySame: false,
  };
}

/**
 * รวม sequence ที่ส่งมาทั้งปี (จากสคริปต์ sync) เข้ากับของที่มีอยู่ — **ช่องต่อช่อง**
 *
 * ไม่ใช่ทับทั้งก้อน เพราะฝั่งโน้นอาจยังไม่ได้ scrape งวดที่กรอกในเว็บไปแล้ว
 * ⇒ ทับทั้งก้อน = ผลที่กรอกวันนี้หายทันทีที่มีคนรัน sync รอบหน้า
 */
export function mergeSequences(
  existing: string,
  incoming: string,
  digits: number,
): { sequence: string; filled: number; conflicts: number } {
  const blank = blankCell(digits);
  const cells = Math.max(existing.length, incoming.length) / digits;
  let out = "";
  let filled = 0;
  let conflicts = 0;

  for (let i = 0; i < Math.ceil(cells); i += 1) {
    const mine = cellAt(existing, i, digits) || blank;
    const theirs = cellAt(incoming, i, digits) || blank;
    if (isBlank(mine, digits) && !isBlank(theirs, digits)) {
      out += theirs;
      filled += 1;
      continue;
    }
    if (!isBlank(mine, digits) && !isBlank(theirs, digits) && mine.toLowerCase() !== theirs.toLowerCase()) {
      conflicts += 1;
    }
    out += mine;
  }
  return { sequence: out, filled, conflicts };
}
