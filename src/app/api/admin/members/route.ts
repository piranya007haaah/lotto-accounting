import { requireAdmin } from "@/lib/auth";
import { adminLineUserIds } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { isMissingColumnError, supabaseAdmin } from "@/lib/supabase";
import type { MemberRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายชื่อสมาชิกทั้งหมด — คนที่รออนุมัติขึ้นก่อน */
export const GET = route(async (request) => {
  await requireAdmin(request);

  const base =
    "id, line_user_id, display_name, picture_url, is_active, can_view_all, approved_at, last_seen_at, created_at";
  const list = (columns: string) =>
    supabaseAdmin()
      .from("app_users")
      .select(columns)
      .order("is_active", { ascending: true })
      .order("created_at", { ascending: false });

  let { data, error } = await list(`${base}, can_view_lottery`);
  // ยังไม่ได้รัน migration 0010 — โชว์รายชื่อได้ตามปกติ แค่ไม่มีปุ่มสิทธิ์หน้าหวย
  if (isMissingColumnError(error, "can_view_lottery")) ({ data, error } = await list(base));

  if (error) throw new HttpError(500, `โหลดรายชื่อสมาชิกไม่สำเร็จ: ${error.message}`);

  const admins = new Set(adminLineUserIds());
  const members: MemberRow[] = ((data ?? []) as unknown as Omit<MemberRow, "is_admin">[]).map((row) => ({
    ...row,
    is_admin: admins.has(row.line_user_id),
  }));

  return ok({
    members,
    pendingCount: members.filter((m) => !m.is_active).length,
  });
});
