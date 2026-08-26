import { requireAdmin } from "@/lib/auth";
import { adminLineUserIds } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import type { MemberRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** รายชื่อสมาชิกทั้งหมด — คนที่รออนุมัติขึ้นก่อน */
export const GET = route(async (request) => {
  await requireAdmin(request);

  const { data, error } = await supabaseAdmin()
    .from("app_users")
    .select("id, line_user_id, display_name, picture_url, is_active, can_view_all, approved_at, last_seen_at, created_at")
    .order("is_active", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw new HttpError(500, `โหลดรายชื่อสมาชิกไม่สำเร็จ: ${error.message}`);

  const admins = new Set(adminLineUserIds());
  const members: MemberRow[] = (data ?? []).map((row) => ({
    ...(row as Omit<MemberRow, "is_admin">),
    is_admin: admins.has(row.line_user_id as string),
  }));

  return ok({
    members,
    pendingCount: members.filter((m) => !m.is_active).length,
  });
});
