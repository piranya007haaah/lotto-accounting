import { requireAdmin } from "@/lib/auth";
import { isAdminLineUserId } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { isMissingColumnError, supabaseAdmin } from "@/lib/supabase";
import { memberPatchSchema, parseOrThrow } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** ผู้ดูแลกดอนุมัติ / ถอนสิทธิ์สมาชิก */
export const PATCH = route(async (request: Request, context: Context) => {
  const admin = await requireAdmin(request);
  const { id } = await context.params;
  const { isActive, canViewAll, canViewLottery } = parseOrThrow(memberPatchSchema, await request.json());

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
    // ถอนสิทธิ์ใช้งาน = ถอนสิทธิ์ดูข้ามบัญชีและหน้าหวยไปด้วย
    if (!isActive) {
      patch.can_view_all = false;
      patch.can_view_lottery = false;
    }
  }
  if (canViewAll !== undefined) patch.can_view_all = canViewAll;
  if (canViewLottery !== undefined) patch.can_view_lottery = canViewLottery;

  const columns =
    "id, line_user_id, display_name, picture_url, is_active, can_view_all, approved_at, last_seen_at, created_at";
  const apply = (payload: Record<string, unknown>, select: string) =>
    supabase.from("app_users").update(payload).eq("id", id).select(select).maybeSingle();

  let { data, error } = await apply(patch, `${columns}, can_view_lottery`);
  // ยังไม่ได้รัน migration 0010 — บอกตรง ๆ ว่าติดอะไร ดีกว่าเงียบแล้วปุ่มไม่ทำงาน
  if (isMissingColumnError(error, "can_view_lottery")) {
    if (patch.can_view_lottery !== undefined) {
      throw new HttpError(
        503,
        "ยังเปิดสิทธิ์ดูหน้าหวยไม่ได้ — ฐานข้อมูลยังไม่ได้รัน supabase/migrations/0010_lottery_viewer.sql",
        "missing_migration",
      );
    }
    delete patch.can_view_lottery;
    ({ data, error } = await apply(patch, columns));
  }

  if (error) throw new HttpError(500, `เปลี่ยนสิทธิ์ไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบสมาชิกคนนี้");

  const row = data as unknown as { line_user_id: string };
  return ok({ member: { ...row, is_admin: isAdminLineUserId(row.line_user_id) } });
});
