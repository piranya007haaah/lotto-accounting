import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { OCR_EFFORT, OCR_MODEL, isOcrConfigured, isVisionConfigured, modelSupportsEffort } from "./env";
import { readImageText } from "./google-vision";
import { HttpError } from "./http";
import { readSlipQr } from "./slip-qr";
import { extractSlipFields, type SlipFields } from "./slip-text";
import { formatDateKey, parseLooseDateTime, toDatetimeLocalValue } from "./thai-date";
import type { Direction, OcrResult, OcrSource, SlipQr } from "./types";

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const Extraction = z.object({
  document_type: z
    .enum(["bank_transfer_slip", "website_withdraw", "website_deposit", "other", "unreadable"])
    .describe("ชนิดของภาพที่เห็น"),
  direction: z
    .enum(["deposit", "withdraw", "unknown"])
    .describe("deposit = เงินเข้าเว็บ (ผู้ใช้โอนไปเว็บ), withdraw = เงินออกจากเว็บ (ถอนสำเร็จ)"),
  amount: z.number().nullable().describe("ยอดเงินของรายการนี้ หน่วยบาท ไม่รวมค่าธรรมเนียม"),
  date_text: z.string().nullable().describe("ข้อความวันที่ที่เห็นบนภาพ คัดมาตามที่เห็นจริง"),
  time_text: z.string().nullable().describe("ข้อความเวลาที่เห็นบนภาพ"),
  datetime_iso: z
    .string()
    .nullable()
    .describe("วันเวลาในรูปแบบ YYYY-MM-DDTHH:mm (เวลาไทย ปีเป็น ค.ศ. แปลงจาก พ.ศ. แล้ว)"),
  ref_no: z.string().nullable().describe("เลขที่รายการ / รหัสอ้างอิง"),
  bank_name: z.string().nullable().describe("ชื่อธนาคารที่ปรากฏ"),
  counterparty: z.string().nullable().describe("ชื่อบัญชี/ผู้รับปลายทาง"),
  site_hint: z.string().nullable().describe("ชื่อเว็บ/แบรนด์ที่เห็นบนภาพ ถ้ามี"),
  confidence: z.number().describe("ความมั่นใจโดยรวม 0.0 - 1.0"),
  notes: z.string().nullable().describe("ข้อสังเกตสั้น ๆ ถ้าอ่านบางส่วนไม่ชัด"),
});

type Extraction = z.infer<typeof Extraction>;

const SYSTEM_PROMPT = `คุณคือผู้ช่วยอ่านหลักฐานการเงินภาษาไทยสำหรับระบบบัญชีส่วนตัว

ภาพที่ได้รับจะเป็นอย่างใดอย่างหนึ่ง
1. สลิปโอนเงินจากแอปธนาคาร/พร้อมเพย์ → ถือเป็น deposit (เงินที่ผู้ใช้โอนเข้าเว็บ)
2. ภาพหน้าจอ "ถอนเงินสำเร็จ" จากเว็บ → ถือเป็น withdraw (เงินที่ถอนออกจากเว็บ)

กติกาการอ่านค่า
- amount ให้เอา "จำนวนเงินของรายการนี้" เท่านั้น
  ห้ามเอา ยอดคงเหลือ / ยอดเงินในบัญชี / เครดิตคงเหลือ / ค่าธรรมเนียม / โบนัส มาใส่
  ตัดคอมมาออกและคืนเป็นตัวเลขล้วน เช่น "1,500.00 บาท" → 1500
- วันที่บนสลิปไทยมักเป็น พ.ศ. ให้ลบ 543 ก่อนใส่ใน datetime_iso เสมอ
  เช่น 25 ส.ค. 2569 → 2026-08-25 ,  25/08/69 → 2026-08-25
  ถ้าปีเป็น ค.ศ. อยู่แล้ว (เช่น 2026) ห้ามลบซ้ำ
- เวลาใช้ระบบ 24 ชั่วโมง ถ้าไม่มีเวลาให้ใส่ 00:00
- date_text / time_text ให้คัดข้อความตามที่เห็นบนภาพจริง ๆ ไม่ต้องแปลง
- ถ้าอ่านค่าไหนไม่ได้ให้ใส่ null อย่าเดา และลด confidence ลง
- ถ้าภาพไม่ใช่สลิปหรือหน้าจอถอนเงินเลย ให้ document_type = "other" และ confidence ต่ำ`;

const USER_PROMPT = `อ่านภาพนี้แล้วดึงข้อมูลตาม schema
ตอบเป็นข้อมูลที่อ่านได้จากภาพเท่านั้น ห้ามแต่งเพิ่ม`;

let client: Anthropic | null = null;

function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const NOT_A_SLIP_WARNING = "รูปนี้อาจไม่ใช่สลิปโอนเงินหรือหน้าจอถอนเงิน";
const AMOUNT_WARNING = "อ่านยอดเงินจากรูปไม่ได้ กรุณากรอกเอง";
const DATE_WARNING = "อ่านวันที่จากรูปไม่ได้ กรุณาเลือกวันที่เอง";

function cleanNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  if (rounded <= 0 || rounded > 100_000_000) return null;
  return rounded;
}

function cleanText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, 200);
}

/** แปลงผลดิบจากโมเดลให้เป็นค่าที่พร้อมเติมลงฟอร์ม */
export function normalizeExtraction(raw: Extraction): OcrResult {
  const warnings: string[] = [];

  const amount = cleanNumber(raw.amount);
  if (amount === null) warnings.push(AMOUNT_WARNING);

  // ใช้ค่าที่โมเดลแปลงมาก่อน ถ้าไม่ได้ค่อยถอยไปอ่านจากข้อความดิบบนสลิป
  const fromIso = parseLooseDateTime(raw.datetime_iso);
  const fromText = parseLooseDateTime(
    [raw.date_text, raw.time_text].filter(Boolean).join(" ") || null,
  );
  const occurred = fromIso ?? fromText;
  if (!occurred) warnings.push(DATE_WARNING);

  // กันกรณีโมเดลลืมแปลง พ.ศ. → ตรวจซ้ำกับข้อความที่เห็นบนสลิป
  if (fromIso && fromText && formatDateKey(fromIso) !== formatDateKey(fromText)) {
    warnings.push(
      `วันที่ที่อ่านได้ไม่ตรงกัน (${formatDateKey(fromIso)} กับ ${formatDateKey(fromText)}) ช่วยตรวจอีกครั้ง`,
    );
  }

  const direction: Direction | null =
    raw.direction === "deposit" || raw.direction === "withdraw" ? raw.direction : null;

  const confidence = Number.isFinite(raw.confidence)
    ? Math.min(1, Math.max(0, raw.confidence))
    : 0;

  if (raw.document_type === "other" || raw.document_type === "unreadable") {
    warnings.push(NOT_A_SLIP_WARNING);
  }

  return {
    direction,
    amount,
    occurredAt: occurred ? occurred.toISOString() : null,
    occurredAtLocal: occurred ? toDatetimeLocalValue(occurred) : null,
    refNo: cleanText(raw.ref_no),
    bankName: cleanText(raw.bank_name),
    counterparty: cleanText(raw.counterparty),
    siteHint: cleanText(raw.site_hint),
    confidence,
    documentType: raw.document_type,
    warnings,
    sources: ["model"],
    qr: null,
    raw,
  };
}

/** ประกอบ OcrResult จากค่าที่อ่านได้ — จุดเดียวที่รู้ว่า field ไหนมาจากตัวอ่านไหน */
function buildResult(input: {
  fields: SlipFields | null;
  qr: SlipQr | null;
  sources: OcrSource[];
  extraWarnings?: string[];
  raw: unknown;
}): OcrResult {
  const { fields, qr } = input;
  const warnings = [...(input.extraWarnings ?? [])];

  const amount = fields?.amount ?? null;
  const occurred = fields?.occurredAt ?? null;
  if (amount === null) warnings.push(AMOUNT_WARNING);
  if (!occurred) warnings.push(DATE_WARNING);

  // มี QR ตรวจสอบสลิปแปลว่าเป็นสลิปโอนเงินจากธนาคารแน่นอน → นับเป็นเงินเข้าเว็บ
  const direction: Direction | null = qr ? "deposit" : (fields?.direction ?? null);

  // ความมั่นใจตรงนี้วัดจาก "ได้ค่าครบไหม" ไม่ใช่ความมั่นใจของตัว OCR เอง
  const confidence = amount !== null && occurred ? 0.9 : amount !== null || occurred ? 0.5 : 0;

  return {
    direction,
    amount,
    occurredAt: occurred ? occurred.toISOString() : null,
    occurredAtLocal: occurred ? toDatetimeLocalValue(occurred) : null,
    refNo: qr?.transRef ?? fields?.refNo ?? null,
    bankName: qr?.sendingBankName ?? fields?.bankName ?? null,
    counterparty: null,
    siteHint: fields?.siteHint ?? null,
    confidence,
    documentType: qr ? "bank_transfer_slip" : (fields?.direction === "withdraw" ? "website_withdraw" : "other"),
    warnings,
    sources: input.sources,
    qr,
    raw: input.raw,
  };
}

/**
 * รวมค่าจาก QR เข้ากับค่าที่โมเดลอ่านได้
 * QR ถอดออกมาตรง ๆ ไม่ผ่านการตีความ จึงชนะค่าที่อ่านจากตัวหนังสือเสมอ
 */
function mergeQr(result: OcrResult, qr: SlipQr | null): OcrResult {
  if (!qr) return result;

  const warnings = result.warnings.filter((warning) => warning !== NOT_A_SLIP_WARNING);
  if (result.refNo && result.refNo.toUpperCase() !== qr.transRef.toUpperCase()) {
    warnings.push(
      `เลขที่รายการที่อ่านจากตัวหนังสือ (${result.refNo}) ไม่ตรงกับใน QR — ใช้ค่าจาก QR แทน ` +
        "ช่วยตรวจยอดเงินและวันที่อีกครั้ง",
    );
  }

  return {
    ...result,
    direction: result.direction ?? "deposit",
    refNo: qr.transRef,
    bankName: qr.sendingBankName ?? result.bankName,
    documentType: "bank_transfer_slip",
    warnings,
    sources: result.sources.includes("qr") ? result.sources : ["qr", ...result.sources],
    qr,
  };
}

/**
 * เติมช่องที่ยังว่างด้วยค่าที่โมเดลอ่านได้ — ไม่ทับค่าเดิมที่ได้มาแล้ว
 * เพราะโมเดลถูกเรียกก็ต่อเมื่อขั้นก่อนหน้าอ่านไม่ครบอยู่แล้ว
 */
function fillGapsFromModel(base: OcrResult, fromModel: OcrResult): OcrResult {
  const amount = base.amount ?? fromModel.amount;
  const occurredAt = base.occurredAt ?? fromModel.occurredAt;
  const occurredAtLocal = base.occurredAtLocal ?? fromModel.occurredAtLocal;

  const warnings = base.warnings.filter(
    (warning) =>
      !(warning === AMOUNT_WARNING && amount !== null) && !(warning === DATE_WARNING && occurredAt),
  );
  for (const warning of fromModel.warnings) {
    if (!warnings.includes(warning)) warnings.push(warning);
  }

  return {
    ...base,
    amount,
    occurredAt,
    occurredAtLocal,
    direction: base.direction ?? fromModel.direction,
    refNo: base.refNo ?? fromModel.refNo,
    bankName: base.bankName ?? fromModel.bankName,
    counterparty: base.counterparty ?? fromModel.counterparty,
    siteHint: base.siteHint ?? fromModel.siteHint,
    confidence: Math.max(base.confidence, fromModel.confidence),
    warnings,
    sources: [...base.sources, "model"],
    raw: { ...(base.raw as object), model: fromModel.raw },
  };
}

/** ส่งรูปให้โมเดลอ่าน — คืน null ถ้าโมเดลปฏิเสธหรืออ่านไม่ออก */
async function readWithModel(
  buffer: Buffer,
  mediaType: SupportedImageType,
): Promise<Extraction | null> {
  const message = await anthropic().beta.messages.parse({
    model: OCR_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      // Haiku ไม่รับ effort — ส่งไปจะได้ 400 กลับมา
      ...(modelSupportsEffort(OCR_MODEL) ? { effort: OCR_EFFORT } : {}),
      format: betaZodOutputFormat(Extraction),
    },
    // ถ้าโมเดลหลักปฏิเสธคำขอ ให้ฝั่งเซิร์ฟเวอร์สลับไปโมเดลสำรองอัตโนมัติ
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mediaType, data: buffer.toString("base64") },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") return null;
  return message.parsed_output ?? null;
}

/**
 * อ่านรูปสลิปแล้วคืนค่าที่พร้อมเติมลงฟอร์ม
 *
 * ทำสามชั้นตามลำดับความน่าเชื่อถือและค่าใช้จ่าย
 *   1. QR ตรวจสอบสลิป  — ในเครื่อง ฟรี แม่นที่สุด แต่ได้แค่เลขที่รายการกับธนาคาร
 *   2. Google Vision    — อ่านยอดเงินกับวันที่ 1,000 ภาพแรกต่อเดือนฟรี
 *   3. Claude           — เรียกเฉพาะตอนสองชั้นบนยังได้ค่าไม่ครบ จึงแทบไม่ถูกเรียก
 */
export async function extractFromImage(params: {
  buffer: Buffer;
  mediaType: SupportedImageType;
  /** ถ้าถอด QR ไว้แล้ว (เช่นตอนเช็คสลิปซ้ำ) ส่งเข้ามาได้เลย จะได้ไม่ต้องถอดซ้ำ */
  qr?: SlipQr | null;
  /** ชื่อเว็บของผู้ใช้ ไว้จับคู่กับข้อความบนภาพเพื่อเลือก dropdown ให้อัตโนมัติ */
  siteNames?: string[];
}): Promise<OcrResult> {
  const qr = params.qr !== undefined ? params.qr : await readSlipQr(params.buffer);

  let fields: SlipFields | null = null;
  let text: string | null = null;
  const warnings: string[] = [];

  if (isVisionConfigured()) {
    try {
      text = await readImageText(params.buffer.toString("base64"));
      if (text) fields = extractSlipFields(text, { siteNames: params.siteNames });
    } catch (error) {
      // Vision ล่มหรือโควตาหมด ยังมี QR กับ Claude ให้ถอยไปได้ อย่าทิ้งทั้งคำขอ
      console.error("[ocr] Google Vision ล้มเหลว:", error);
      warnings.push(
        error instanceof HttpError ? error.message : "อ่านตัวหนังสือบนรูปไม่สำเร็จ",
      );
    }
  }

  const base = buildResult({
    fields,
    qr,
    sources: [...(qr ? (["qr"] as const) : []), ...(fields ? (["vision"] as const) : [])],
    extraWarnings: warnings,
    raw: { qr, vision: fields ? { fields, text } : null },
  });

  // ครบแล้วก็จบตรงนี้ ไม่ต้องเสียเงินเรียกโมเดล
  const complete = base.amount !== null && base.occurredAt !== null;
  if (complete || !isOcrConfigured()) {
    if (base.sources.length === 0) {
      throw new HttpError(
        501,
        "ยังไม่ได้ตั้งค่า GOOGLE_VISION_API_KEY และรูปนี้ไม่มี QR ตรวจสอบสลิป — กรอกยอดและวันที่เองได้เลย",
        "ocr_not_configured",
      );
    }
    return base;
  }

  let parsed: Extraction | null = null;
  try {
    parsed = await readWithModel(params.buffer, params.mediaType);
  } catch (error) {
    // โมเดลล่มหรือโควตาหมด ก็ไม่ควรทิ้งค่าที่อ่านได้แล้ว
    if (base.sources.length === 0) throw error;
    console.error("[ocr] เรียกโมเดลไม่สำเร็จ:", error);
  }

  if (!parsed) {
    if (base.sources.length > 0) return base;
    throw new HttpError(422, "อ่านรูปไม่สำเร็จ กรุณากรอกข้อมูลเอง", "ocr_empty");
  }

  return mergeQr(fillGapsFromModel(base, normalizeExtraction(parsed)), qr);
}
