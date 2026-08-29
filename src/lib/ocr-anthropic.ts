import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { OCR_EFFORT, OCR_MODEL } from "./env";
import { HttpError } from "./http";
import { Extraction, normalizeExtraction, type SupportedImageType } from "./ocr-extraction";
import type { OcrResult } from "./types";

/** ตัวอ่านรูปด้วย Claude — แม่นกว่าแต่คิดเงินตามจำนวนรูป */

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

export async function extractWithClaude(params: {
  base64: string;
  mediaType: SupportedImageType;
}): Promise<OcrResult> {
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

  return normalizeExtraction({ ...parsed, provider: "anthropic" });
}
