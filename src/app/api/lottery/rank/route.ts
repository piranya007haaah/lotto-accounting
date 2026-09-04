/**
 * GET  จัดอันดับ "หวยไหนใช้สูตรนี้แล้วกำไรดีสุด" ในปี test ที่เลือก (ผู้ดูแลเท่านั้น)
 *
 * ทำไมคำนวณฝั่ง server: ต้องอ่านผลย้อนหลัง **ทุกหวย** (~0.8 MB) มาคำนวณ ถ้าส่งดิบ
 * ไปให้เบราว์เซอร์ทำ มือถือจะโหลดหนักทุกครั้งที่เปลี่ยนปี ⇒ ที่นี่คำนวณแล้วส่งกลับ
 * แค่ตาราง (~300 แถว) · ส่วนหน้ารายละเอียดของหวยตัวเดียวคำนวณในเบราว์เซอร์
 * (ดึงเฉพาะกลุ่มนั้นจาก `/api/lottery/datasets?lottery=&position=`) จะได้ลาก n_bet
 * แล้วเห็นผลทันที
 *
 * engine เป็นไฟล์เดียวกับที่หน้าเว็บใช้ (`src/lib/lottery/*`) — ไม่มีเวอร์ชันของ
 * server แยกต่างหาก ⇒ ตัวเลขในตารางกับในหน้ารายละเอียดตรงกันเสมอ
 */

import { requireAdmin } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { readAllDatasetRows } from "@/lib/lottery/dataset-read";
import { FORMULAS } from "@/lib/lottery/formulas";
import { rankGroups, type DatasetRow, type RankMode } from "@/lib/lottery/rank";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** ตัวเลขจากหน้าเว็บ — กันค่าเพี้ยน/ค่ามหาศาลที่ทำให้คำนวณค้าง */
function intParam(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const GET = route(async (request) => {
  await requireAdmin(request);

  const query = new URL(request.url).searchParams;
  const formula = (query.get("formula") ?? "").trim();
  if (!FORMULAS[formula]) throw new HttpError(400, `ไม่รู้จักสูตร "${formula}"`, "bad_formula");

  const testYear = (query.get("year") ?? "").trim();
  if (!/^\d{2}$/.test(testYear)) throw new HttpError(400, "ปี test ต้องเป็น พ.ศ. 2 หลัก", "bad_year");

  const mode: RankMode = query.get("mode") === "hindsight" ? "hindsight" : "train";
  const capital = intParam(query.get("capital"), 100000, 0, 1_000_000_000);
  const betPerNumber = intParam(query.get("bet"), 100, 1, 1_000_000);
  const payoutRate = intParam(query.get("payout"), 100, 1, 10000);

  // ปีหลัง test ไม่ต้องดึงเลย — ห้ามใช้เป็น train อยู่แล้ว (lookahead) และเปลืองแบนด์วิดท์
  let entries: DatasetRow[];
  try {
    entries = await readAllDatasetRows({ upToYear: testYear });
  } catch (caught) {
    throw new HttpError(500, `อ่านผลหวยไม่สำเร็จ: ${(caught as Error).message}`);
  }

  const rows = rankGroups({
    rows: entries,
    formula,
    testYear,
    mode,
    capital,
    betPerNumber,
    payoutRate,
  });

  return ok({ formula, testYear, mode, capital, betPerNumber, payoutRate, rows });
});
