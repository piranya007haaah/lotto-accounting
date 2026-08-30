import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { resolveRange } from "@/lib/range";
import { moveToFinal, removeImage } from "@/lib/storage";
import { fetchTransactions, isMissingPairColumn } from "@/lib/summary";
import { supabaseAdmin } from "@/lib/supabase";
import { formatMonthKey, fromZonedISO } from "@/lib/thai-date";
import { parseOrThrow, transactionInputSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const user = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const { from, to, label } = resolveRange(params);

  const transactions = await fetchTransactions({
    ownerId: user.id,
    // มีสิทธิ์ can_view_all เท่านั้นจึงเห็นข้ามบัญชี — การเพิ่ม/แก้/ลบยังผูกกับตัวเองเสมอ
    includeAllOwners: user.canViewAll,
    from,
    to,
    siteId: params.get("siteId"),
    direction: params.get("direction"),
    limit: Number(params.get("limit")) || 500,
  });

  return ok({ label, transactions });
});

export const POST = route(async (request) => {
  const user = await requireUser(request);
  const input = parseOrThrow(transactionInputSchema, await request.json());
  const supabase = supabaseAdmin();

  // เว็บที่เลือกต้องเป็นเว็บกลางหรือเว็บของตัวเองเท่านั้น
  const { data: site } = await supabase
    .from("sites")
    .select("id")
    .eq("id", input.siteId)
    .or(`owner_id.is.null,owner_id.eq.${user.id}`)
    .maybeSingle();
  if (!site) throw new HttpError(400, "ไม่พบเว็บที่เลือก");

  const occurredAt = fromZonedISO(input.occurredAtLocal, APP_TIMEZONE);
  if (Number.isNaN(occurredAt.getTime())) throw new HttpError(400, "วันเวลาไม่ถูกต้อง");

  const monthKey = formatMonthKey(occurredAt, APP_TIMEZONE);
  let imagePath: string | null = null;
  let webImagePath: string | null = null;
  if (input.imagePath) imagePath = await moveToFinal(user.id, input.imagePath, monthKey);
  if (input.webImagePath) webImagePath = await moveToFinal(user.id, input.webImagePath, monthKey);

  const base = {
    owner_id: user.id,
    site_id: input.siteId,
    direction: input.direction,
    amount: input.amount,
    occurred_at: occurredAt.toISOString(),
    ref_no: input.refNo ?? null,
    bank_name: input.bankName ?? null,
    counterparty: input.counterparty ?? null,
    note: input.note ?? null,
    image_path: imagePath,
    image_hash: input.imageHash ?? null,
    ocr_status: input.ocrStatus,
    ocr_confidence: input.ocrConfidence ?? null,
    ocr_raw: input.ocrRaw ?? null,
  };

  // คอลัมน์ชุดนี้มาพร้อม migration 0007 — ฐานข้อมูลที่ยังไม่ได้รันจะบันทึกส่วนที่เหลือได้ตามปกติ
  const pairColumns = {
    web_image_path: webImagePath,
    web_ref_no: input.webRefNo ?? null,
    site_url: input.siteUrl ?? null,
    account_no: input.accountNo ?? null,
    account_name: input.accountName ?? null,
    counterparty_bank: input.counterpartyBank ?? null,
    counterparty_account_no: input.counterpartyAccountNo ?? null,
  };

  const insert = (payload: Record<string, unknown>) =>
    supabase.from("transactions").insert(payload).select("id").single();

  let result = await insert({ ...base, ...pairColumns });
  let pendingMigration = false;

  if (isMissingPairColumn(result.error)) {
    // ยังไม่มีคอลัมน์ให้เก็บภาพหน้าเว็บ — ไม่เก็บไฟล์ค้างไว้เฉย ๆ
    await removeImage(webImagePath);
    webImagePath = null;
    pendingMigration = true;
    result = await insert(base);
  }

  if (result.error) {
    // insert ไม่ผ่านแล้วรูปถูกย้ายไปแล้ว — เก็บกวาดไม่ให้เหลือไฟล์ค้าง
    await removeImage(imagePath);
    await removeImage(webImagePath);
    if (result.error.code === "23505") {
      throw new HttpError(409, "สลิปใบนี้ถูกบันทึกไปแล้ว", "duplicate_slip");
    }
    throw new HttpError(500, `บันทึกรายการไม่สำเร็จ: ${result.error.message}`);
  }

  return ok({ id: result.data.id, pendingMigration }, { status: 201 });
});
