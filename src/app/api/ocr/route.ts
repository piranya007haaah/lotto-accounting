import { requireUser } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { SUPPORTED_IMAGE_TYPES, extractFromImage, type SupportedImageType } from "@/lib/ocr";
import { MAX_IMAGE_BYTES, sha256, uploadTemp } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";
import type { OcrResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * รับรูป → เช็คว่าเคยบันทึกไปแล้วหรือยัง → อัปโหลดขึ้น storage → ให้โมเดลอ่านวันที่/ยอดเงิน
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

  // กันบันทึกสลิปใบเดิมซ้ำ — เจอแล้วไม่ต้องอัปโหลด/อ่านซ้ำให้เปลืองค่าเรียก API
  const { data: existing } = await supabaseAdmin()
    .from("transactions")
    .select("id, amount, direction, occurred_at, site:sites(name)")
    .eq("owner_id", user.id)
    .eq("image_hash", imageHash)
    .maybeSingle();

  if (existing) {
    const site = existing.site as unknown;
    const siteName = Array.isArray(site)
      ? ((site[0] as { name?: string } | undefined)?.name ?? null)
      : ((site as { name?: string } | null)?.name ?? null);
    return ok({
      duplicate: {
        id: existing.id,
        amount: Number(existing.amount),
        direction: existing.direction,
        occurredAt: existing.occurred_at,
        siteName,
      },
      imagePath: null,
      imageHash,
      ocr: null,
      ocrError: null,
    });
  }

  const imagePath = await uploadTemp(user.id, buffer, mediaType);

  let ocr: OcrResult | null = null;
  let ocrError: string | null = null;
  try {
    ocr = await extractFromImage({ base64: buffer.toString("base64"), mediaType });
  } catch (error) {
    ocrError =
      error instanceof HttpError
        ? error.message
        : `อ่านรูปอัตโนมัติไม่สำเร็จ: ${error instanceof Error ? error.message : "ไม่ทราบสาเหตุ"}`;
    console.error("[ocr] ล้มเหลว:", error);
  }

  return ok({ duplicate: null, imagePath, imageHash, ocr, ocrError });
});
