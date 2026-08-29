import { z } from "zod";
import { formatDateKey, parseLooseDateTime, toDatetimeLocalValue } from "./thai-date";
import type { Direction, OcrResult } from "./types";

/**
 * โครงข้อมูลกลางที่ทุก provider ต้องคืนมาให้เหมือนกัน
 * (Claude ใช้เป็น output schema, Google Vision ใช้เป็นเป้าหมายของตัว parse ข้อความ)
 */

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

export const Extraction = z.object({
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

export type Extraction = z.infer<typeof Extraction>;

/** ข้อมูลเพิ่มเติมที่เก็บไว้ใน ocr_raw เพื่อย้อนดูตอนดีบัก */
export type ExtractionRaw = Extraction & {
  provider?: string;
  text?: string;
};

export function cleanNumber(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  if (rounded <= 0 || rounded > 100_000_000) return null;
  return rounded;
}

export function cleanText(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "null") return null;
  return trimmed.slice(0, 200);
}

/** แปลงผลดิบจาก provider ให้เป็นค่าที่พร้อมเติมลงฟอร์ม */
export function normalizeExtraction(raw: ExtractionRaw): OcrResult {
  const warnings: string[] = [];

  const amount = cleanNumber(raw.amount);
  if (amount === null) warnings.push("อ่านยอดเงินจากรูปไม่ได้ กรุณากรอกเอง");

  // ใช้ค่าที่ provider แปลงมาก่อน ถ้าไม่ได้ค่อยถอยไปอ่านจากข้อความดิบบนสลิป
  const fromIso = parseLooseDateTime(raw.datetime_iso);
  const fromText = parseLooseDateTime(
    [raw.date_text, raw.time_text].filter(Boolean).join(" ") || null,
  );
  const occurred = fromIso ?? fromText;
  if (!occurred) warnings.push("อ่านวันที่จากรูปไม่ได้ กรุณาเลือกวันที่เอง");

  // กันกรณีลืมแปลง พ.ศ. → ตรวจซ้ำกับข้อความที่เห็นบนสลิป
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
