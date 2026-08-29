import { resolveOcrProvider } from "./env";
import { HttpError } from "./http";
import { extractWithClaude } from "./ocr-anthropic";
import { extractWithGoogleVision } from "./ocr-google";
import type { SupportedImageType } from "./ocr-extraction";
import type { OcrResult } from "./types";

export {
  SUPPORTED_IMAGE_TYPES,
  normalizeExtraction,
  type Extraction,
  type ExtractionRaw,
  type SupportedImageType,
} from "./ocr-extraction";

/**
 * ส่งรูปให้ตัวอ่านที่ตั้งค่าไว้ แล้วคืนค่าที่พร้อมเติมลงฟอร์ม
 * เลือก provider จาก OCR_PROVIDER (ดู resolveOcrProvider ใน env.ts)
 */
export async function extractFromImage(params: {
  base64: string;
  mediaType: SupportedImageType;
  /** ชื่อเว็บของผู้ใช้ ใช้เดาว่าสลิปใบนี้เป็นของเว็บไหน */
  siteNames?: string[];
}): Promise<OcrResult> {
  const provider = resolveOcrProvider();

  if (!provider) {
    throw new HttpError(
      501,
      "ยังไม่ได้ตั้งค่าตัวอ่านรูป (GOOGLE_VISION_API_KEY หรือ ANTHROPIC_API_KEY) — กรอกยอดและวันที่เองได้เลย",
      "ocr_not_configured",
    );
  }

  if (provider === "google") return extractWithGoogleVision(params);
  return extractWithClaude(params);
}
