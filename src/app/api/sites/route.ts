import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { parseOrThrow, siteInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SITE_SELECT = "id, owner_id, name, note, color, sort_order, is_active";

/** เว็บที่ผู้ใช้เห็น = เว็บกลาง (owner_id null) + เว็บที่ตัวเองเพิ่ม */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const includeInactive = new URL(request.url).searchParams.get("all") === "1";

  let query = supabaseAdmin()
    .from("sites")
    .select(SITE_SELECT)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;
  if (error) throw new HttpError(500, `ดึงรายชื่อเว็บไม่สำเร็จ: ${error.message}`);
  return ok({ sites: data ?? [] });
});

export const POST = route(async (request) => {
  const user = await requireUser(request);
  const input = parseOrThrow(siteInputSchema, await request.json());

  const { data, error } = await supabaseAdmin()
    .from("sites")
    .insert({
      owner_id: user.id,
      name: input.name,
      color: input.color ?? null,
      note: input.note ?? null,
      sort_order: input.sortOrder ?? 100,
    })
    .select(SITE_SELECT)
    .single();

  if (error) {
    if (error.code === "23505") throw new HttpError(409, "มีเว็บชื่อนี้อยู่แล้ว");
    throw new HttpError(500, `เพิ่มเว็บไม่สำเร็จ: ${error.message}`);
  }
  return ok({ site: data }, { status: 201 });
});
