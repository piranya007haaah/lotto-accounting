import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { resolveRange } from "@/lib/range";
import { moveToFinal, removeImage } from "@/lib/storage";
import { fetchTransactions } from "@/lib/summary";
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

  let imagePath: string | null = null;
  if (input.imagePath) {
    imagePath = await moveToFinal(user.id, input.imagePath, formatMonthKey(occurredAt, APP_TIMEZONE));
  }

  const { data, error } = await supabase
    .from("transactions")
    .insert({
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
    })
    .select("id")
    .single();

  if (error) {
    // insert ไม่ผ่านแล้วรูปถูกย้ายไปแล้ว — เก็บกวาดไม่ให้เหลือไฟล์ค้าง
    await removeImage(imagePath);
    if (error.code === "23505") {
      throw new HttpError(409, "สลิปใบนี้ถูกบันทึกไปแล้ว", "duplicate_slip");
    }
    throw new HttpError(500, `บันทึกรายการไม่สำเร็จ: ${error.message}`);
  }

  return ok({ id: data.id }, { status: 201 });
});
