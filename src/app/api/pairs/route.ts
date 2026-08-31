import crypto from "node:crypto";
import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { readTextFromImage, slipResultFromText, SUPPORTED_IMAGE_TYPES, type SupportedImageType } from "@/lib/ocr";
import { classifyDocument, type DocKind, type DuplicateRef, type ReadImage } from "@/lib/pairing";
import { readSlipQr } from "@/lib/slip-qr";
import { MAX_IMAGE_BYTES, sha256, uploadTemp } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase";
import { fromZonedISO } from "@/lib/thai-date";
import { extractWebPageFields } from "@/lib/web-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** หารายการเดิมที่ตรงกับเงื่อนไขหนึ่งข้อ — ใช้ทั้งไฟล์ซ้ำ เลขที่รายการซ้ำ และรหัสของเว็บซ้ำ */
async function findExisting(
  ownerId: string,
  column: "image_hash" | "ref_no" | "web_ref_no",
  value: string,
  reason: DuplicateRef["reason"],
): Promise<DuplicateRef | null> {
  const { data, error } = await supabaseAdmin()
    .from("transactions")
    .select("id, amount, direction, occurred_at, site:sites(name)")
    .eq("owner_id", ownerId)
    .eq(column, value)
    .limit(1)
    .maybeSingle();

  // ฐานข้อมูลที่ยังไม่รัน migration 0007 ไม่มีคอลัมน์ web_ref_no — ข้ามการเช็คชั้นนั้นไป
  if (error || !data) return null;
  return toDuplicate(data, reason);
}

/** แถวจากฐานข้อมูล → รูปแบบที่ฝั่งหน้าเว็บเอาไปแสดง */
function toDuplicate(row: Record<string, unknown>, reason: DuplicateRef["reason"]): DuplicateRef {
  const site = row.site as unknown;
  const siteName = Array.isArray(site)
    ? ((site[0] as { name?: string } | undefined)?.name ?? null)
    : ((site as { name?: string } | null)?.name ?? null);

  return {
    id: row.id as string,
    amount: Number(row.amount),
    direction: row.direction as DuplicateRef["direction"],
    occurredAt: row.occurred_at as string,
    siteName,
    reason,
  };
}

/**
 * รายการเดิมที่ยอด + วันเวลา + ทิศทาง ตรงกัน
 *
 * ชั้นกันซ้ำสามชั้นแรกอาศัย "หลักฐานประจำใบ" (ไฟล์เดิม / เลขที่รายการบนสลิป /
 * รหัสรายการของเว็บ) — หน้าเว็บบางเจ้าไม่มีรหัสให้เลย แคปใหม่อีกรอบก็เป็นคนละไฟล์
 * ชั้นนี้จึงเทียบจากตัวเลขของรายการแทน แต่เป็นแค่คำเตือน ไม่บล็อก
 * เพราะยอดเท่ากันในนาทีเดียวกันจริง ๆ ก็เกิดขึ้นได้
 */
async function findSameRecord(
  ownerId: string,
  input: { amount: number; occurredAt: Date; direction: string },
): Promise<DuplicateRef | null> {
  const window = 2 * 60 * 1000;
  const { data } = await supabaseAdmin()
    .from("transactions")
    .select("id, amount, direction, occurred_at, site:sites(name)")
    .eq("owner_id", ownerId)
    .eq("direction", input.direction)
    .eq("amount", input.amount)
    .gte("occurred_at", new Date(input.occurredAt.getTime() - window).toISOString())
    .lte("occurred_at", new Date(input.occurredAt.getTime() + window).toISOString())
    .limit(1)
    .maybeSingle();

  return data ? toDuplicate(data, "same") : null;
}

/**
 * อ่านรูปหนึ่งใบของหน้าบันทึกรายการ
 *
 * ไม่เหมาว่าทุกรูปเป็นสลิป — แยกก่อนว่าเป็นสลิปธนาคารหรือหน้าฝาก/ถอนของเว็บ
 * แล้วค่อยใช้ตัวแกะคนละชุด ส่วนการจับคู่ทำต่อที่ฝั่งหน้าเว็บ เพราะเป็นตรรกะล้วน ๆ
 * และผู้ใช้ต้องสลับคู่เองได้โดยไม่ต้องอัปโหลดใหม่
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

  const qr = await readSlipQr(buffer);
  const { text, warning } = await readTextFromImage(buffer);

  // ผู้ใช้บอกได้ว่ารูปนี้เป็นอะไร (ตอนเลือกทีละช่อง) ไม่ได้บอกก็เดาจากสิ่งที่อ่านได้
  const told = form.get("kind");
  const kind: DocKind = told === "web" || told === "slip" ? told : classifyDocument({ text, qr });

  const { data: sites } = await supabaseAdmin().from("sites").select("name").eq("is_active", true);
  const siteNames = (sites ?? []).map((site) => site.name as string);

  const warnings = warning ? [warning] : [];
  const slip = kind === "slip" ? slipResultFromText({ text, qr, siteNames, warnings: [] }) : null;
  const web = kind === "web" ? extractWebPageFields(text ?? "", { siteNames }) : null;

  if (kind === "slip" && !slip) {
    warnings.push(
      text
        ? "อ่านรูปนี้ไม่ออก — กรอกยอดและวันที่เอง"
        : "ยังไม่ได้ตั้งค่า GOOGLE_VISION_API_KEY และรูปนี้ไม่มี QR ตรวจสอบสลิป — กรอกเองได้เลย",
    );
  }
  // หน้าเว็บไม่มี QR ให้ถอด ทุกอย่างบนนั้นต้องอ่านจากตัวหนังสือล้วน ๆ
  if (kind === "web" && !text) {
    warnings.push("อ่านตัวหนังสือบนภาพหน้าเว็บไม่ได้ — กรอกเว็บ ยอด และบัญชีเอง");
  }

  // กันบันทึกซ้ำตั้งแต่ตอนอ่าน จะได้ไม่ต้องอัปโหลดไฟล์ให้เปลืองที่
  //   1. ไฟล์เดียวกันเป๊ะ ๆ  2. สลิปใบเดียวกัน (เลขที่รายการจาก QR)  3. หน้าเว็บใบเดียวกัน (รหัสของเว็บ)
  const duplicate =
    (await findExisting(user.id, "image_hash", imageHash, "image")) ??
    (slip?.refNo ? await findExisting(user.id, "ref_no", slip.refNo, "ref") : null) ??
    (web?.refCode ? await findExisting(user.id, "web_ref_no", web.refCode, "web_ref") : null);

  // ยอด + วันเวลาที่อ่านได้ ใช้เทียบกับรายการเดิมเป็นชั้นสุดท้าย (เตือน ไม่บล็อก)
  const amount = slip?.amount ?? web?.amount ?? null;
  const occurredAtLocal = slip?.occurredAtLocal ?? web?.occurredAtLocal ?? null;
  const direction = web?.direction ?? slip?.direction ?? null;
  const occurredAt = occurredAtLocal ? fromZonedISO(occurredAtLocal, APP_TIMEZONE) : null;

  const similar =
    duplicate || amount === null || !occurredAt || !direction || Number.isNaN(occurredAt.getTime())
      ? null
      : await findSameRecord(user.id, { amount, occurredAt, direction });

  const image: Omit<ReadImage, "order"> = {
    id: crypto.randomUUID(),
    fileName: file.name || "image.jpg",
    kind,
    imagePath: duplicate ? null : await uploadTemp(user.id, buffer, mediaType),
    imageHash,
    slip,
    web,
    duplicate,
    similar,
    warnings,
    error: null,
  };

  return ok({ image });
});
