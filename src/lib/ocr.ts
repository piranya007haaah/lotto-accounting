import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { OCR_EFFORT, OCR_MODEL, isOcrConfigured } from "./env";
import { HttpError } from "./http";
import { formatDateKey, parseLooseDateTime, toDatetimeLocalValue } from "./thai-date";
import type { Direction, OcrResult } from "./types";

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
  if (amount === null) warnings.push("อ่านยอดเงินจากรูปไม่ได้ กรุณากรอกเอง");

  // ใช้ค่าที่โมเดลแปลงมาก่อน ถ้าไม่ได้ค่อยถอยไปอ่านจากข้อความดิบบนสลิป
  const fromIso = parseLooseDateTime(raw.datetime_iso);
  const fromText = parseLooseDateTime(
    [raw.date_text, raw.time_text].filter(Boolean).join(" ") || null,
  );
  const occurred = fromIso ?? fromText;
  if (!occurred) warnings.push("อ่านวันที่จากรูปไม่ได้ กรุณาเลือกวันที่เอง");

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
    warnings.push("รูปนี้อาจไม่ใช่สลิปโอนเงินหรือหน้าจอถอนเงิน");
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
    raw,
  };
}

/** ส่งรูปให้โมเดลอ่าน แล้วคืนค่าที่พร้อมเติมลงฟอร์ม */
export async function extractFromImage(params: {
  base64: string;
  mediaType: SupportedImageType;
}): Promise<OcrResult> {
  if (!isOcrConfigured()) {
    throw new HttpError(
      501,
      "ยังไม่ได้ตั้งค่า ANTHROPIC_API_KEY จึงอ่านรูปอัตโนมัติไม่ได้ — กรอกยอดและวันที่เองได้เลย",
      "ocr_not_configured",
    );
  }

  const message = await anthropic().beta.messages.parse({
    model: OCR_MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: OCR_EFFORT,
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
            source: { type: "base64", media_type: params.mediaType, data: params.base64 },
          },
          { type: "text", text: USER_PROMPT },
        ],
      },
    ],
  });

  if (message.stop_reason === "refusal") {
    throw new HttpError(422, "โมเดลไม่สามารถอ่านรูปนี้ได้ กรุณากรอกข้อมูลเอง", "ocr_refused");
  }

  const parsed = message.parsed_output;
  if (!parsed) {
    throw new HttpError(422, "อ่านรูปไม่สำเร็จ กรุณากรอกข้อมูลเอง", "ocr_empty");
  }

  return normalizeExtraction(parsed);
}
