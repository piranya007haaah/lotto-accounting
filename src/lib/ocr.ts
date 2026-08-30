import { isVisionConfigured } from "./env";
import { readImageText } from "./google-vision";
import { HttpError } from "./http";
import { readSlipQr } from "./slip-qr";
import { extractSlipFields, type SlipFields } from "./slip-text";
import { toDatetimeLocalValue } from "./thai-date";
import type { Direction, OcrResult, OcrSource, SlipQr } from "./types";

export const SUPPORTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

const AMOUNT_WARNING = "อ่านยอดเงินจากรูปไม่ได้ กรุณากรอกเอง";
const DATE_WARNING = "อ่านวันที่จากรูปไม่ได้ กรุณาเลือกวันที่เอง";

/** ประกอบ OcrResult จากค่าที่อ่านได้ — จุดเดียวที่รู้ว่า field ไหนมาจากตัวอ่านไหน */
function buildResult(input: {
  fields: SlipFields | null;
  qr: SlipQr | null;
  sources: OcrSource[];
  extraWarnings: string[];
  visionText: string | null;
}): OcrResult {
  const { fields, qr } = input;
  const warnings = [...input.extraWarnings];

  const amount = fields?.amount ?? null;
  const occurred = fields?.occurredAt ?? null;
  if (amount === null) warnings.push(AMOUNT_WARNING);
  if (!occurred) warnings.push(DATE_WARNING);

  // มี QR ตรวจสอบสลิปแปลว่าเป็นสลิปโอนเงินจากธนาคารแน่นอน → นับเป็นเงินเข้าเว็บ
  const direction: Direction | null = qr ? "deposit" : (fields?.direction ?? null);

  // ตัวเลขนี้วัดจาก "ได้ค่าครบไหม" ไม่ใช่ความมั่นใจของตัว OCR เอง
  const confidence = amount !== null && occurred ? 0.9 : amount !== null || occurred ? 0.5 : 0;

  // เลขที่รายการกับธนาคารจาก QR ถอดมาตรง ๆ ไม่ผ่านการอ่านตัวหนังสือ จึงชนะค่าที่ OCR อ่านได้เสมอ
  if (qr && fields?.refNo && fields.refNo.toUpperCase() !== qr.transRef.toUpperCase()) {
    warnings.push(
      `เลขที่รายการที่อ่านจากตัวหนังสือ (${fields.refNo}) ไม่ตรงกับใน QR — ใช้ค่าจาก QR แทน ` +
        "ช่วยตรวจยอดเงินและวันที่อีกครั้ง",
    );
  }

  return {
    direction,
    amount,
    occurredAt: occurred ? occurred.toISOString() : null,
    occurredAtLocal: occurred ? toDatetimeLocalValue(occurred) : null,
    refNo: qr?.transRef ?? fields?.refNo ?? null,
    bankName: qr?.sendingBankName ?? fields?.bankName ?? null,
    counterparty: fields?.counterparty ?? null,
    siteHint: fields?.siteHint ?? null,
    confidence,
    documentType: qr
      ? "bank_transfer_slip"
      : fields?.direction === "withdraw"
        ? "website_withdraw"
        : "other",
    warnings,
    sources: input.sources,
    qr,
    raw: { qr, vision: fields ? { fields, text: input.visionText } : null },
  };
}

/** ข้อความบนรูปที่ Vision อ่านได้ — ไม่ล้มทั้งคำขอเมื่อ Vision ล่ม แต่คืน warning กลับไปแทน */
export interface ImageText {
  text: string | null;
  warning: string | null;
}

/** อ่านตัวหนังสือบนรูปด้วย Vision (ยังไม่ตั้งค่าคีย์ = ไม่อ่าน ไม่ถือว่าพัง) */
export async function readTextFromImage(buffer: Buffer): Promise<ImageText> {
  if (!isVisionConfigured()) return { text: null, warning: null };
  try {
    return { text: await readImageText(buffer.toString("base64")), warning: null };
  } catch (error) {
    // Vision ล่มหรือโควตาหมด ยังมีค่าจาก QR ให้ใช้ อย่าทิ้งทั้งคำขอ
    console.error("[ocr] Google Vision ล้มเหลว:", error);
    return {
      text: null,
      warning: error instanceof HttpError ? error.message : "อ่านตัวหนังสือบนรูปไม่สำเร็จ",
    };
  }
}

/** ประกอบผลของสลิปจากข้อความที่อ่านมาแล้ว — ไม่เรียก API ซ้ำ */
export function slipResultFromText(params: {
  text: string | null;
  qr: SlipQr | null;
  siteNames?: string[];
  warnings?: string[];
}): OcrResult | null {
  const fields = params.text ? extractSlipFields(params.text, { siteNames: params.siteNames }) : null;
  const sources: OcrSource[] = [
    ...(params.qr ? (["qr"] as const) : []),
    ...(fields ? (["vision"] as const) : []),
  ];
  if (sources.length === 0) return null;

  return buildResult({
    fields,
    qr: params.qr,
    sources,
    extraWarnings: params.warnings ?? [],
    visionText: params.text,
  });
}

/**
 * อ่านรูปสลิปแล้วคืนค่าที่พร้อมเติมลงฟอร์ม
 *
 * สองชั้น ชั้นแรกฟรีและแม่นกว่า จึงชนะเสมอเมื่อค่าชนกัน
 *   1. QR ตรวจสอบสลิป — ในเครื่อง ให้เลขที่รายการกับธนาคารแบบไม่มีทางอ่านเพี้ยน
 *   2. Google Vision  — อ่านตัวหนังสือเอายอดเงิน วันเวลา ทิศทาง และชื่อเว็บ
 *
 * อ่านไม่ครบไม่ใช่ทางตัน — ฟอร์มให้กรอกยอดกับวันที่เองได้อยู่แล้ว
 */
export async function extractFromImage(params: {
  buffer: Buffer;
  /** ถ้าถอด QR ไว้แล้ว (เช่นตอนเช็คสลิปซ้ำ) ส่งเข้ามาได้เลย จะได้ไม่ต้องถอดซ้ำ */
  qr?: SlipQr | null;
  /** ชื่อเว็บของผู้ใช้ ไว้จับคู่กับข้อความบนภาพเพื่อเลือก dropdown ให้อัตโนมัติ */
  siteNames?: string[];
}): Promise<OcrResult> {
  const qr = params.qr !== undefined ? params.qr : await readSlipQr(params.buffer);
  const { text, warning } = await readTextFromImage(params.buffer);

  const result = slipResultFromText({
    text,
    qr,
    siteNames: params.siteNames,
    warnings: warning ? [warning] : [],
  });

  if (!result) {
    throw new HttpError(
      501,
      isVisionConfigured()
        ? "อ่านรูปนี้ไม่สำเร็จ กรุณากรอกยอดและวันที่เอง"
        : "ยังไม่ได้ตั้งค่า GOOGLE_VISION_API_KEY และรูปนี้ไม่มี QR ตรวจสอบสลิป — กรอกยอดและวันที่เองได้เลย",
      isVisionConfigured() ? "ocr_empty" : "ocr_not_configured",
    );
  }

  return result;
}
