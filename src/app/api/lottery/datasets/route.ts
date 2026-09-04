/**
 * POST  รับผลหวยย้อนหลังจากแอป Streamlit (SQLite) — ยืนยันด้วย shared secret
 * GET   รายชื่อหวย/ตำแหน่ง/ปีที่มีข้อมูล (ผู้ดูแลเท่านั้น) — ไว้ทำตัวเลือกในหน้าเลือกสูตร
 *
 * ⚠️ ทางเดียว: Streamlit เป็นเจ้าของข้อมูล แอปนี้ยังไม่แก้ผลหวย
 * (จนกว่าจะย้ายหน้ากรอกผลมาด้วย) — POST ซ้ำด้วยคีย์เดิม = ทับของเดิม
 */

import { requireLotteryViewer } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { readJsonBody, requireIngestSecret } from "@/lib/ingest-auth";
import { readAllDatasetRows } from "@/lib/lottery/dataset-read";
import { payloadSchema } from "@/lib/lottery/dataset-ingest";
import { mergeSequences } from "@/lib/lottery/sequence-merge";
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

  // ⚠️⚠️ **เติมเฉพาะช่องว่าง** ไม่ใช่ทับทั้งปี — หน้ากรอกผลของแอปนี้เขียนตารางเดียวกัน
  // และมักกรอกงวดล่าสุดก่อนที่ฝั่งโน้นจะ scrape ทัน ⇒ ทับทั้งก้อน = ผลวันนี้หายเงียบ ๆ
  // (`overwrite: true` จากฝั่งโน้นเท่านั้นถึงจะทับได้ — ไว้ backfill/แก้ข้อมูลผิด)
  let existing: Awaited<ReturnType<typeof readAllDatasetRows>> = [];
  if (!parsed.data.overwrite) {
    try {
      existing = await readAllDatasetRows();
    } catch (caught) {
      if (caught instanceof HttpError) throw caught;
      throw new HttpError(500, `อ่านผลหวยเดิมไม่สำเร็จ: ${(caught as Error).message}`);
    }
  }
  const byKey = new Map(existing.map((row) => [`${row.lottery}|${row.position}|${row.year}`, row]));

  let filled = 0;
  let conflicts = 0;
  const rows = parsed.data.entries.map((entry) => {
    let sequence = entry.sequence;
    if (!parsed.data.overwrite) {
      const found = byKey.get(`${entry.lottery}|${entry.position}|${entry.year}`);
      if (found) {
        const merged = mergeSequences(found.sequence ?? "", entry.sequence, entry.digits);
        sequence = merged.sequence;
        filled += merged.filled;
        conflicts += merged.conflicts;
      }
    }
    return {
      lottery: entry.lottery,
      position: entry.position,
      year: entry.year,
      flag: entry.flag,
      sequence,
      is_date_sorted: entry.isDateSorted,
      digits: entry.digits,
      updated_at: new Date().toISOString(),
    };
  });

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

  // บอกกลับไปให้เห็นว่าเติมไปกี่ช่อง และมีช่องไหนที่สองฝั่งไม่ตรงกันบ้าง
  // (ค่าเดิมถูกเก็บไว้ — ไม่ใช่เงียบแล้วเลือกข้างเอง)
  return ok({
    saved: rows.length,
    payouts: parsed.data.payouts.length,
    filled,
    conflicts,
    overwrite: parsed.data.overwrite,
  });
});

export const GET = route(async (request) => {
  await requireLotteryViewer(request);

  // ระบุหวย+ตำแหน่ง = ขอ "ผลจริงทั้งปี" ของกลุ่มเดียว (ไม่กี่ KB) ไว้ให้หน้าจอ
  // คำนวณสูตรเองในเบราว์เซอร์ — ปรับ n_bet/ทุน/เรตจ่ายแล้วเห็นผลทันทีโดยไม่ยิงเซิร์ฟเวอร์ซ้ำ
  const query = new URL(request.url).searchParams;
  const lottery = (query.get("lottery") ?? "").trim();
  const position = (query.get("position") ?? "").trim();
  if (lottery && position) {
    const { data, error } = await supabaseAdmin()
      .from(TABLE)
      .select("lottery, position, year, flag, sequence, digits, is_date_sorted")
      .eq("lottery", lottery)
      .eq("position", position)
      .order("year");
    if (error) throw new HttpError(500, `อ่านผลหวยไม่สำเร็จ: ${error.message}`);
    if ((data ?? []).length === 0) throw new HttpError(404, "ไม่มีข้อมูลของหวย/ตำแหน่งนี้", "not_found");
    return ok({ entries: data });
  }

  // เอาแค่คีย์ ไม่ดึง sequence (ทั้งตาราง ~0.8 MB — หนักเกินไปสำหรับตัวเลือก)
  // ⚠️ ต้องไล่ทีละหน้า — Supabase ตัดที่ 1,000 แถวเสมอ (ดู lib/lottery/dataset-read.ts)
  //
  // `?digits=2` = เอาเฉพาะขา 2 ตัว (หน้าเลือกสูตรใช้ — สูตรที่นั่นเป็นสูตร 2 ตัวล้วน)
  // ไม่ใส่ = ได้ทั้ง 2 และ 3 ตัว พร้อมคอลัมน์ `digits` ติดไปด้วย (หน้าพอร์ตใช้ตอนเพิ่มขา
  // เพราะพอร์ตมีขาสามบนได้) — **เดาจากชื่อตำแหน่งไม่ได้ ต้องอ่านค่าจริงจากตาราง**
  const digitsParam = query.get("digits");
  const digits = digitsParam === "2" ? 2 : digitsParam === "3" ? 3 : undefined;

  let data: { lottery: string; position: string; year: string; flag: string; digits?: number }[];
  try {
    data = await readAllDatasetRows({ withSequence: false, digits });
  } catch (caught) {
    if (caught instanceof HttpError) throw caught;
    throw new HttpError(500, `อ่านรายชื่อหวยไม่สำเร็จ: ${(caught as Error).message}`);
  }

  const groups = new Map<
    string,
    { lottery: string; position: string; flag: string; digits: number; years: string[] }
  >();
  for (const row of data) {
    const key = `${row.lottery}|${row.position}`;
    const group = groups.get(key) ?? {
      lottery: row.lottery as string,
      position: row.position as string,
      flag: (row.flag as string) ?? "🎰",
      digits: Number(row.digits ?? 2),
      years: [],
    };
    group.years.push(row.year as string);
    groups.set(key, group);
  }

  const all = [...groups.values()].map((group) => ({
    ...group,
    // ปีใหม่สุดอยู่ท้าย — ตัวเลือก "ปีที่ทดสอบ" หยิบตัวท้ายเป็นค่าเริ่มต้นได้เลย
    years: [...new Set(group.years)].sort(),
  }));
  return ok({
    groups: all,
    years: [...new Set(all.flatMap((g) => g.years))].sort(),
  });
});
