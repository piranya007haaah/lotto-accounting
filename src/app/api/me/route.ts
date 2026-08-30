import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE, isVisionConfigured } from "@/lib/env";
import { ok, route } from "@/lib/http";
import { isMissingPairColumn } from "@/lib/summary";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * ฐานข้อมูลรัน migration 0007 แล้วหรือยัง
 * ถามคอลัมน์เดียวแบบไม่เอาแถว — ยังไม่ได้รันจะได้บอกผู้ใช้ตั้งแต่ก่อนอัปโหลด
 * ว่าภาพหน้าเว็บกับเลขบัญชีจะยังไม่ถูกเก็บ
 */
async function hasPairColumns(): Promise<boolean> {
  const { error } = await supabaseAdmin().from("transactions").select("web_image_path").limit(1);
  return !isMissingPairColumn(error);
}

export const GET = route(async (request) => {
  const user = await requireUser(request);
  return ok({
    user: {
      id: user.id,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
    },
    isAdmin: user.isAdmin,
    canViewAll: user.canViewAll,
    ocrEnabled: isVisionConfigured(),
    /** false = ยังไม่ได้รัน supabase/migrations/0007_slip_pairs.sql */
    pairColumnsReady: await hasPairColumns(),
    timeZone: APP_TIMEZONE,
  });
});
