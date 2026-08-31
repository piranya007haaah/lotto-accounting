import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * รายชื่อคนไว้สลับดูรายการของแต่ละคน
 *
 * ต่างจาก /api/admin/members ตรงที่ไม่ต้องเป็นผู้ดูแล แต่ต้องมีสิทธิ์ "เห็นทุกบัญชี"
 * และคืนเฉพาะชื่อกับรูปโปรไฟล์ ไม่มีสถานะสิทธิ์หรือ LINE user id ติดมาด้วย
 */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  if (!user.canViewAll && !user.isAdmin) {
    throw new HttpError(403, "ไม่มีสิทธิ์ดูรายการของคนอื่น", "not_allowed");
  }

  const { data, error } = await supabaseAdmin()
    .from("app_users")
    .select("id, display_name, picture_url")
    .eq("is_active", true)
    .order("display_name", { ascending: true });

  if (error) throw new HttpError(500, `โหลดรายชื่อสมาชิกไม่สำเร็จ: ${error.message}`);
  return ok({ members: data ?? [] });
});
