import { requireAdmin } from "@/lib/auth";
import { isAdminLineUserId } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { memberPatchSchema, parseOrThrow } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** ผู้ดูแลกดอนุมัติ / ถอนสิทธิ์สมาชิก */
export const PATCH = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin(request);
  const { id } = await context.params;
  const { isActive, canViewAll } = parseOrThrow(memberPatchSchema, await request.json());

  // ปิดสิทธิ์เข้าใช้งานของตัวเองไม่ได้ (กันล็อกตัวเองออก) แต่สลับมุมมองข้อมูลของตัวเองได้
  if (isActive !== undefined && id === admin.id) {
    throw new HttpError(400, "ปิดสิทธิ์ใช้งานของตัวเองไม่ได้");
  }

  const supabase = supabaseAdmin();
  const { data: target, error: findError } = await supabase
    .from("app_users")
    .select("line_user_id")
    .eq("id", id)
    .maybeSingle();

  if (findError) throw new HttpError(500, `อ่านข้อมูลสมาชิกไม่สำเร็จ: ${findError.message}`);
  if (!target) throw new HttpError(404, "ไม่พบสมาชิกคนนี้");

  // ผู้ดูแลถูกกำหนดจาก env — ปิดสิทธิ์เข้าใช้งานผ่านหน้าเว็บไม่ได้ ต้องแก้ที่ LINE_ADMIN_USER_IDS
  if (isActive !== undefined && isAdminLineUserId(target.line_user_id as string)) {
    throw new HttpError(400, "คนนี้เป็นผู้ดูแล ปิดสิทธิ์ใช้งานได้ที่ LINE_ADMIN_USER_IDS เท่านั้น");
  }

  const patch: Record<string, unknown> = {};
  if (isActive !== undefined) {
    patch.is_active = isActive;
    patch.approved_at = isActive ? new Date().toISOString() : null;
    // ถอนสิทธิ์ใช้งาน = ถอนสิทธิ์ดูข้ามบัญชีไปด้วย
    if (!isActive) patch.can_view_all = false;
  }
  if (canViewAll !== undefined) patch.can_view_all = canViewAll;

  const { data, error } = await supabase
    .from("app_users")
    .update(patch)
    .eq("id", id)
    .select("id, line_user_id, display_name, picture_url, is_active, can_view_all, approved_at, last_seen_at, created_at")
    .maybeSingle();

  if (error) throw new HttpError(500, `เปลี่ยนสิทธิ์ไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบสมาชิกคนนี้");

  return ok({ member: { ...data, is_admin: isAdminLineUserId(data.line_user_id as string) } });
});
