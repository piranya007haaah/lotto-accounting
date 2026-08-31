import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { removeImage } from "@/lib/storage";
import { isMissingPairColumn, TRANSACTION_SELECT, TRANSACTION_SELECT_BASE } from "@/lib/summary";
import { supabaseAdmin } from "@/lib/supabase";
import { fromZonedISO } from "@/lib/thai-date";
import { parseOrThrow, transactionPatchSchema } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = route(async (request: Request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;

  const read = (columns: string) =>
    supabaseAdmin()
      .from("transactions")
      .select(columns)
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

  let { data, error } = await read(TRANSACTION_SELECT);
  // ฐานข้อมูลที่ยังไม่รัน migration 0007 — ดึงเฉพาะคอลัมน์เดิมไปก่อน
  if (isMissingPairColumn(error)) ({ data, error } = await read(TRANSACTION_SELECT_BASE));

  if (error) throw new HttpError(500, `ดึงรายการไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบรายการนี้");
  return ok({ transaction: data });
});

export const PATCH = route(async (request: Request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;
  const input = parseOrThrow(transactionPatchSchema, await request.json());
  const supabase = supabaseAdmin();

  const patch: Record<string, unknown> = {};
  if (input.direction !== undefined) patch.direction = input.direction;
  if (input.amount !== undefined) patch.amount = input.amount;
  if (input.refNo !== undefined) patch.ref_no = input.refNo;
  if (input.bankName !== undefined) patch.bank_name = input.bankName;
  if (input.counterparty !== undefined) patch.counterparty = input.counterparty;
  if (input.note !== undefined) patch.note = input.note;
  if (input.ocrStatus !== undefined) patch.ocr_status = input.ocrStatus;

  if (input.occurredAtLocal !== undefined) {
    const occurredAt = fromZonedISO(input.occurredAtLocal, APP_TIMEZONE);
    if (Number.isNaN(occurredAt.getTime())) throw new HttpError(400, "วันเวลาไม่ถูกต้อง");
    patch.occurred_at = occurredAt.toISOString();
  }

  if (input.siteId !== undefined) {
    const { data: site } = await supabase
      .from("sites")
      .select("id")
      .eq("id", input.siteId)
      .or(`owner_id.is.null,owner_id.eq.${user.id}`)
      .maybeSingle();
    if (!site) throw new HttpError(400, "ไม่พบเว็บที่เลือก");
    patch.site_id = input.siteId;
  }

  if (Object.keys(patch).length === 0) throw new HttpError(400, "ไม่มีข้อมูลที่จะแก้ไข");

  const write = (columns: string) =>
    supabase
      .from("transactions")
      .update(patch)
      .eq("id", id)
      .eq("owner_id", user.id)
      .select(columns)
      .maybeSingle();

  let { data, error } = await write(TRANSACTION_SELECT);
  if (isMissingPairColumn(error)) ({ data, error } = await write(TRANSACTION_SELECT_BASE));

  if (error) throw new HttpError(500, `แก้ไขรายการไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบรายการนี้");
  return ok({ transaction: data });
});

export const DELETE = route(async (request: Request, context: Context) => {
  const user = await requireUser(request);
  const { id } = await context.params;

  // select("*") เพื่อให้ลบภาพหน้าเว็บได้ด้วยโดยไม่พังกับฐานข้อมูลที่ยังไม่มีคอลัมน์นั้น
  let query = supabaseAdmin().from("transactions").delete().eq("id", id);
  // ผู้ดูแลลบของใครก็ได้ (ไว้เก็บกวาดรายการที่ลงผิด) คนอื่นลบได้เฉพาะของตัวเอง
  if (!user.isAdmin) query = query.eq("owner_id", user.id);

  const { data, error } = await query.select("*").maybeSingle();

  if (error) throw new HttpError(500, `ลบรายการไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(404, "ไม่พบรายการนี้");

  await removeImage(data.image_path as string | null);
  await removeImage(data.web_image_path as string | null);
  return ok({ deleted: true });
});
