import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { SUPPORTED_IMAGE_TYPES, extractFromImage, type SupportedImageType } from "@/lib/ocr";
import { readSlipQr } from "@/lib/slip-qr";
import { MAX_IMAGE_BYTES, sha256, uploadTemp } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";
import type { OcrResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type DuplicateReason = "image" | "ref";

/** หารายการเดิมที่ตรงกับเงื่อนไขหนึ่งข้อ — ใช้ทั้งกรณีไฟล์ซ้ำและเลขที่รายการซ้ำ */
async function findExisting(ownerId: string, column: "image_hash" | "ref_no", value: string) {
  const { data } = await supabaseAdmin()
    .from("transactions")
    .select("id, amount, direction, occurred_at, site:sites(name)")
    .eq("owner_id", ownerId)
    .eq(column, value)
    // ref_no ไม่มี unique index (รายการที่กรอกเองอาจซ้ำกันได้) — เอาแถวเดียวพอ ไม่ให้ maybeSingle พัง
    .limit(1)
    .maybeSingle();
  return data;
}

function toDuplicate(row: NonNullable<Awaited<ReturnType<typeof findExisting>>>, reason: DuplicateReason) {
  const site = row.site as unknown;
  const siteName = Array.isArray(site)
    ? ((site[0] as { name?: string } | undefined)?.name ?? null)
    : ((site as { name?: string } | null)?.name ?? null);
  return {
    id: row.id,
    amount: Number(row.amount),
    direction: row.direction,
    occurredAt: row.occurred_at,
    siteName,
    reason,
  };
}

/**
 * รับรูป → ถอด QR ตรวจสอบสลิป → เช็คว่าเคยบันทึกไปแล้วหรือยัง → อัปโหลดขึ้น storage → อ่านวันที่/ยอดเงิน
 * ถ้าอ่านไม่ได้จะไม่ error ทิ้ง แต่คืน ocrError กลับไปให้กรอกเอง
 */
export const POST = route(async (request) => {
  const user = await requireUser(request);

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "กรุณาแนบไฟล์รูป");
  if (file.size === 0) throw new HttpError(400, "ไฟล์รูปว่างเปล่า");
  if (file.size > MAX_IMAGE_BYTES) {
    throw new HttpError(413, `ไฟล์ใหญ่เกินไป (สูงสุด ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`);
  }

  const mediaType = file.type as SupportedImageType;
  if (!SUPPORTED_IMAGE_TYPES.includes(mediaType)) {
    throw new HttpError(415, `ไฟล์ชนิด ${file.type || "ไม่ทราบ"} ไม่รองรับ — ใช้ JPG, PNG, WebP หรือ GIF`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const imageHash = sha256(buffer);

  // ถอด QR ก่อนทุกอย่าง — ได้เลขที่รายการไว้เช็คซ้ำ และไม่ต้องถอดซ้ำตอนอ่านรูป
  const qr = await readSlipQr(buffer);

  // กันบันทึกสลิปใบเดิมซ้ำ — เจอแล้วไม่ต้องอัปโหลด/อ่านซ้ำให้เปลืองค่าเรียก API
  //   ชั้นที่ 1 ไฟล์เดียวกันเป๊ะ ๆ
  //   ชั้นที่ 2 สลิปใบเดียวกันแต่ไฟล์คนละไฟล์ (ครอปใหม่ / บีบอัดใหม่ / แคปซ้ำ) ดูจากเลขที่รายการใน QR
  const sameImage = await findExisting(user.id, "image_hash", imageHash);
  const sameRef = sameImage || !qr ? null : await findExisting(user.id, "ref_no", qr.transRef);
  const existing = sameImage ?? sameRef;

  if (existing) {
    return ok({
      duplicate: toDuplicate(existing, sameImage ? "image" : "ref"),
      imagePath: null,
      imageHash,
      qr,
      ocr: null,
      ocrError: null,
    });
  }

  const imagePath = await uploadTemp(user.id, buffer, mediaType);

  // ชื่อเว็บทั้งหมด ไว้จับคู่กับข้อความบนภาพเพื่อเลือก dropdown ให้อัตโนมัติ
  const { data: sites } = await supabaseAdmin()
    .from("sites")
    .select("name")
    .eq("is_active", true);

  let ocr: OcrResult | null = null;
  let ocrError: string | null = null;
  try {
    ocr = await extractFromImage({ buffer, qr, siteNames: (sites ?? []).map((site) => site.name) });
  } catch (error) {
    ocrError =
      error instanceof HttpError
        ? error.message
        : `อ่านรูปอัตโนมัติไม่สำเร็จ: ${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"}`;
    console.error("[ocr] ล้มเหลว:", error);
  }

  return ok({ duplicate: null, imagePath, imageHash, qr, ocr, ocrError });
});
