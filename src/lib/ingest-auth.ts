/**
 * ยืนยันตัวของ "ท่อข้อมูลจากแอป Streamlit" — ผู้เรียกเป็นสคริปต์/แอป ไม่ใช่คนที่
 * ล็อกอิน LINE อยู่ จึงใช้ shared secret ไม่ใช่ ID token
 *
 * ใช้ secret ตัวเดียวกันทุกท่อ (snapshot ของพอร์ต · ผลหวย) — ปลายทางเดียวกัน
 * เจ้าของเดียวกัน แยก secret หลายตัวมีแต่จะลืมตั้งตัวใดตัวหนึ่งแล้วงงว่าทำไม 401
 */

import { timingSafeEqual } from "node:crypto";
import { portfolioSnapshotSecret } from "./env";
import { HttpError } from "./http";

export const INGEST_SECRET_HEADER = "x-snapshot-secret";

/** เทียบแบบไม่รั่วเวลา — ความยาวต่างกันก็ต้องไม่ตอบเร็วกว่า */
function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** โยน HttpError ถ้า header ไม่ถูก — ไม่ตั้ง env = **ปิดรับ** ไม่ใช่ "รับใครก็ได้" */
export function requireIngestSecret(request: Request): void {
  const expected = portfolioSnapshotSecret();
  if (!expected) {
    throw new HttpError(
      503,
      "ยังไม่ได้ตั้ง PORTFOLIO_SNAPSHOT_SECRET ที่ฝั่งเซิร์ฟเวอร์",
      "not_configured",
    );
  }
  const given = request.headers.get(INGEST_SECRET_HEADER) ?? "";
  if (!given || !secretMatches(given, expected)) {
    throw new HttpError(401, "secret ไม่ถูกต้อง", "bad_secret");
  }
}

/** อ่าน body เป็น JSON พร้อมเพดานขนาด — คืน error ที่บอกสาเหตุจริง ไม่ใช่ 500 เปล่า ๆ */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const raw = await request.text();
  if (raw.length > maxBytes) {
    throw new HttpError(413, "ข้อมูลที่ส่งมาใหญ่เกินไป", "too_large");
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, "body ไม่ใช่ JSON ที่อ่านได้", "bad_json");
  }
}
