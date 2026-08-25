import { requireUser } from "@/lib/auth";
import { STORAGE_BUCKET } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** คืน signed URL อายุสั้นสำหรับดูรูปสลิปของตัวเองเท่านั้น */
export const GET = route(async (request) => {
  const user = await requireUser(request);
  const path = new URL(request.url).searchParams.get("path");
  if (!path) throw new HttpError(400, "ไม่ได้ระบุ path ของรูป");
  if (!path.startsWith(`${user.id}/`)) throw new HttpError(403, "ไม่มีสิทธิ์ดูรูปนี้");

  const { data, error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(path, 300);

  if (error || !data) throw new HttpError(404, `ไม่พบรูปนี้: ${error?.message ?? ""}`.trim());
  return ok({ url: data.signedUrl, expiresIn: 300 });
});
