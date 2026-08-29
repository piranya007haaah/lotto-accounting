import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { isMissingColumnError, supabaseAdmin } from "@/lib/supabase";
import { parseOrThrow, sitePatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** แก้ได้เฉพาะเว็บที่ตัวเองเพิ่ม (เว็บกลางแก้ไม่ได้) */
export const PATCH = route(async (request: Request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  const input = parseOrThrow(sitePatchSchema, await request.json());

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.color !== undefined) patch.color = input.color;
  if (input.emoji !== undefined) patch.emoji = input.emoji;
  if (input.note !== undefined) patch.note = input.note;
  if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder;
  if (input.isActive !== undefined) patch.is_active = input.isActive;
  if (Object.keys(patch).length === 0) throw new HttpError(400, "ไม่มีข้อมูลที่จะแก้ไข");

  const update = (value: Record<string, unknown>) =>
    supabaseAdmin()
      .from("sites")
      .update(value)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select("*")
      .maybeSingle();

  let result = await update(patch);

  // ฐานข้อมูลที่ยังไม่รัน migration 0005 — แก้ส่วนอื่นต่อได้ ยกเว้นขอแก้ emoji อย่างเดียว
  if (result.error && isMissingColumnError(result.error, "emoji") && "emoji" in patch) {
    const { emoji: _emoji, ...rest } = patch;
    if (Object.keys(rest).length === 0) {
      throw new HttpError(400, "ฐานข้อมูลยังไม่มีช่อง emoji — รัน supabase/migrations/0005_site_emoji.sql ก่อน");
    }
    result = await update(rest);
  }

  if (result.error) {
    if (result.error.code === "23505") throw new HttpError(409, "มีเว็บชื่อนี้อยู่แล้ว");
    throw new HttpError(500, `แก้ไขเว็บไม่สำเร็จ: ${result.error.message}`);
  }
  if (!result.data) throw new HttpError(404, "ไม่พบเว็บนี้ หรือเป็นเว็บกลางที่แก้ไม่ได้");
  return ok({ site: result.data });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;

  const { error, count } = await supabaseAdmin()
    .from("sites")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) {
    if (error.code === "23503") {
      throw new HttpError(409, "เว็บนี้มีรายการบันทึกอยู่ ลบไม่ได้ — ปิดการใช้งานแทนได้");
    }
    throw new HttpError(500, `ลบเว็บไม่สำเร็จ: ${error.message}`);
  }
  if (!count) throw new HttpError(404, "ไม่พบเว็บนี้ หรือเป็นเว็บกลางที่ลบไม่ได้");
  return ok({ deleted: true });
});
