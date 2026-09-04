/**
 * อ่านตาราง `lottery_datasets` แบบ **ครบทุกแถว**
 *
 * ⚠️⚠️ Supabase ตัดผลลัพธ์ที่ **1,000 แถว** เสมอ (ตั้งค่า `db-max-rows` ของ PostgREST)
 * และ `.limit(20000)` ก็ไม่ช่วย — มันตัดเงียบ ๆ ไม่มี error ⇒ ตอนนี้มี 1,182 entry
 * เรียกตรง ๆ จะได้หวยไม่ครบ (วัดจริง: เห็น 233 กลุ่มจาก 270 · ตารางอันดับหาย 180 แถว)
 * ต้องไล่ทีละหน้าด้วย `.range()` จนกว่าจะได้น้อยกว่าหนึ่งหน้าเท่านั้น
 *
 * ⚠️⚠️ ตารางนี้เก็บ **ทั้งขา 2 ตัวและ 3 ตัว** ปนกัน (แยกด้วยคอลัมน์ `digits`) ตั้งแต่
 * ฝั่ง Streamlit ส่ง `datasets_3d` มาด้วย — คนเรียกต้องบอกทุกครั้งว่าเอากี่หลัก
 * ไม่งั้นสูตร 2 ตัวจะไปอ่าน sequence ของสามบน (3 ตัวอักษร/วัน) แล้วได้เลขมั่ว
 * แบบไม่มี error ให้เห็น
 */

import { HttpError } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import type { DatasetRow } from "./rank";

const TABLE = "lottery_datasets";
/** ขนาดหน้า — เท่ากับเพดานของ Supabase พอดี ขอมากกว่านี้ก็ได้เท่าเดิม */
const PAGE = 1000;
/** กันวนไม่รู้จบถ้าฝั่ง Supabase ทำตัวแปลก (1,182 แถวปัจจุบัน = 2 หน้า) */
const MAX_PAGES = 100;

const DIGITS_MIGRATION = "supabase/migrations/0011_lottery_portfolios.sql";

/**
 * ยังไม่ได้รัน migration 0011 = ยังไม่มีคอลัมน์ `digits`
 * บอกชื่อไฟล์ตรง ๆ ดีกว่าโยน "column does not exist" ให้ไปงมเอง
 * (กติกาเดียวกับ `missingMigration` ของ /api/lottery/portfolios)
 */
function digitsColumnMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const message = error.message ?? "";
  return message.includes("digits") && /column|schema cache|does not exist/i.test(message);
}

export async function readAllDatasetRows(options?: {
  /** เอาเฉพาะปีที่ ≤ ปีนี้ (ปีหลัง test ห้ามใช้เป็น train อยู่แล้ว) */
  upToYear?: string;
  /** ไม่เอา sequence มาด้วย — ใช้ตอนทำรายการตัวเลือก (ทั้งตาราง ~0.8 MB) */
  withSequence?: boolean;
  /** 2 = สองบน/สองล่าง · 3 = สามบน · ไม่ระบุ = เอาทั้งคู่ (ต้องดู `digits` ของแต่ละแถวเอง) */
  digits?: 2 | 3;
}): Promise<DatasetRow[]> {
  const columns = options?.withSequence === false
    ? "lottery, position, year, flag, digits"
    : "lottery, position, year, flag, digits, sequence";

  const rows: DatasetRow[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    let query = supabaseAdmin()
      .from(TABLE)
      .select(columns)
      .order("lottery")
      .order("position")
      .order("year")
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (options?.upToYear) query = query.lte("year", options.upToYear);
    if (options?.digits) query = query.eq("digits", options.digits);

    const { data, error } = await query;
    if (digitsColumnMissing(error)) {
      throw new HttpError(
        503,
        `ฐานข้อมูลยังไม่ได้รัน ${DIGITS_MIGRATION} (ยังไม่มีคอลัมน์ digits)`,
        "missing_migration",
      );
    }
    if (error) throw error;
    const batch = (data ?? []) as unknown as DatasetRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}
