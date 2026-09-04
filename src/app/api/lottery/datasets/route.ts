/**
 * POST  รับผลหวยย้อนหลังจากแอป Streamlit (SQLite) — ยืนยันด้วย shared secret
 * GET   รายชื่อหวย/ตำแหน่ง/ปีที่มีข้อมูล (ผู้ดูแลเท่านั้น) — ไว้ทำตัวเลือกในหน้าเลือกสูตร
 *
 * ⚠️ ทางเดียว: Streamlit เป็นเจ้าของข้อมูล แอปนี้ยังไม่แก้ผลหวย
 * (จนกว่าจะย้ายหน้ากรอกผลมาด้วย) — POST ซ้ำด้วยคีย์เดิม = ทับของเดิม
 */

import { requireAdmin } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { readJsonBody, requireIngestSecret } from "@/lib/ingest-auth";
import { payloadSchema } from "@/lib/lottery/dataset-ingest";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "lottery_datasets";
const PAYOUT_TABLE = "lottery_payouts";
/** ทั้ง DB เป็นสตริงรวมกัน ~1.5 MB — 6 MB คือเผื่อไว้เยอะแล้ว แต่ควรส่งเป็นก้อน ๆ */
const MAX_BODY_BYTES = 6 * 1024 * 1024;
/** Supabase upsert ทีละก้อน — ใหญ่กว่านี้ statement เริ่มช้าและ error อ่านยาก */
const CHUNK = 200;

export const POST = route(async (request) => {
  requireIngestSecret(request);

  const parsed = payloadSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(400, `ข้อมูลผิดรูปแบบ: ${first?.path.join(".")} — ${first?.message}`, "bad_payload");
  }

  const supabase = supabaseAdmin();
  const rows = parsed.data.entries.map((entry) => ({
    lottery: entry.lottery,
    position: entry.position,
    year: entry.year,
    flag: entry.flag,
    sequence: entry.sequence,
    is_date_sorted: entry.isDateSorted,
    updated_at: new Date().toISOString(),
  }));

  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from(TABLE)
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "lottery,position,year" });
    if (error) {
      throw new HttpError(
        500,
        `บันทึกผลหวยไม่สำเร็จ (ก้อนที่ ${Math.floor(i / CHUNK) + 1}): ${error.message}`,
      );
    }
  }

  if (parsed.data.payouts.length > 0) {
    const { error } = await supabase
      .from(PAYOUT_TABLE)
      .upsert(parsed.data.payouts, { onConflict: "lottery" });
    if (error) throw new HttpError(500, `บันทึกเรตจ่ายไม่สำเร็จ: ${error.message}`);
  }

  return ok({ saved: rows.length, payouts: parsed.data.payouts.length });
});

export const GET = route(async (request) => {
  await requireAdmin(request);

  // เอาแค่คีย์ ไม่ดึง sequence (ทั้งตาราง ~0.8 MB — หนักเกินไปสำหรับตัวเลือก)
  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select("lottery, position, year, flag")
    .order("lottery")
    .order("position")
    .order("year");
  if (error) throw new HttpError(500, `อ่านรายชื่อหวยไม่สำเร็จ: ${error.message}`);

  const groups = new Map<string, { lottery: string; position: string; flag: string; years: string[] }>();
  for (const row of data ?? []) {
    const key = `${row.lottery}|${row.position}`;
    const group = groups.get(key) ?? {
      lottery: row.lottery as string,
      position: row.position as string,
      flag: (row.flag as string) ?? "🎰",
      years: [],
    };
    group.years.push(row.year as string);
    groups.set(key, group);
  }

  const all = [...groups.values()];
  return ok({
    groups: all,
    years: [...new Set(all.flatMap((g) => g.years))].sort(),
  });
});
