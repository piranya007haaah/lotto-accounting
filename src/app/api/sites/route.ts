import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { isMissingColumnError, supabaseAdmin } from "@/lib/supabase";
import { parseOrThrow, siteInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายชื่อเว็บใช้ร่วมกันทั้งระบบ — ทุกคนที่ล็อกอินเห็นชุดเดียวกัน */
export const GET = route(async (request) => {
  await requireUser(request);
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";

  // select * เผื่อฐานข้อมูลที่ยังไม่มีคอลัมน์ emoji — แถวที่ไม่มีก็แค่ไม่มี key นั้น
  let query = supabaseAdmin()
    .from("sites")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new HttpError(500, `ดึงรายชื่อเว็บไม่สำเร็จ: ${error.message}`);
  return ok({ sites: data ?? [] });
});

export const POST = route(async (request) => {
  await requireUser(request);
  const input = parseOrThrow(siteInputSchema, await request.json());

  const payload: Record<string, unknown> = {
    owner_id: null,
    name: input.name,
    color: input.color ?? null,
    note: input.note ?? null,
    sort_order: input.sortOrder ?? 100,
  };

  let result = await supabaseAdmin()
    .from("sites")
    .insert({ ...payload, emoji: input.emoji ?? null })
    .select("*")
    .single();

  // ฐานข้อมูลที่ยังไม่รัน migration 0005 — บันทึกโดยไม่มี emoji ไปก่อน
  if (result.error && isMissingColumnError(result.error, "emoji")) {
    result = await supabaseAdmin().from("sites").insert(payload).select("*").single();
  }

  if (result.error) {
    if (result.error.code === "23505") throw new HttpError(409, "มีเว็บชื่อนี้อยู่แล้ว");
    throw new HttpError(500, `เพิ่มเว็บไม่สำเร็จ: ${result.error.message}`);
  }
  return ok({ site: result.data }, { status: 201 });
});
