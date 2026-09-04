/**
 * อ่านตาราง `lottery_datasets` แบบ **ครบทุกแถว**
 *
 * ⚠️⚠️ Supabase ตัดผลลัพธ์ที่ **1,000 แถว** เสมอ (ตั้งค่า `db-max-rows` ของ PostgREST)
 * และ `.limit(20000)` ก็ไม่ช่วย — มันตัดเงียบ ๆ ไม่มี error ⇒ ตอนนี้มี 1,182 entry
 * เรียกตรง ๆ จะได้หวยไม่ครบ (วัดจริง: เห็น 233 กลุ่มจาก 270 · ตารางอันดับหาย 180 แถว)
 * ต้องไล่ทีละหน้าด้วย `.range()` จนกว่าจะได้น้อยกว่าหนึ่งหน้าเท่านั้น
 */

import { supabaseAdmin } from "@/lib/supabase";
import type { DatasetRow } from "./rank";

const TABLE = "lottery_datasets";
/** ขนาดหน้า — เท่ากับเพดานของ Supabase พอดี ขอมากกว่านี้ก็ได้เท่าเดิม */
const PAGE = 1000;
/** กันวนไม่รู้จบถ้าฝั่ง Supabase ทำตัวแปลก (1,182 แถวปัจจุบัน = 2 หน้า) */
const MAX_PAGES = 100;

export async function readAllDatasetRows(options?: {
  /** เอาเฉพาะปีที่ ≤ ปีนี้ (ปีหลัง test ห้ามใช้เป็น train อยู่แล้ว) */
  upToYear?: string;
  /** ไม่เอา sequence มาด้วย — ใช้ตอนทำรายการตัวเลือก (ทั้งตาราง ~0.8 MB) */
  withSequence?: boolean;
}): Promise<DatasetRow[]> {
  const columns = options?.withSequence === false
    ? "lottery, position, year, flag"
    : "lottery, position, year, flag, sequence";

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

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as unknown as DatasetRow[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}
