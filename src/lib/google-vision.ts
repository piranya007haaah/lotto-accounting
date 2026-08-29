import { GOOGLE_VISION_API_KEY, isVisionConfigured } from "./env";
import { HttpError } from "./http";

/**
 * เรียก Google Cloud Vision REST API เพื่ออ่านตัวหนังสือบนรูป
 *
 * ใช้ REST + API key ตรง ๆ แทนแพ็กเกจ @google-cloud/vision เพราะแพ็กเกจนั้นลาก gRPC
 * กับ service account มาด้วยทั้งชุด ซึ่งเกินจำเป็นสำหรับการยิงครั้งเดียวจบ
 *
 * โควตา: 1,000 หน่วย/เดือนแรกฟรี หลังจากนั้นคิดตามจำนวนภาพ
 * หนึ่งภาพ = หนึ่งหน่วย (ขนาดภาพไม่มีผลต่อราคา)
 */

const ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

/** ตัดที่ 20 วินาที — ฝั่ง route มีเพดาน 60 วินาทีและยังต้องเผื่อขั้นตอนอื่น */
const TIMEOUT_MS = 20_000;

interface VisionResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { code?: number; message?: string };
  }>;
  error?: { code?: number; message?: string; status?: string };
}

/**
 * อ่านข้อความทั้งหมดบนรูป — คืน null ถ้าไม่เจอตัวหนังสือเลย
 * โยน HttpError เมื่อเรียก API ไม่สำเร็จ เพื่อให้ฝั่งบนตัดสินใจว่าจะถอยไปทางไหนต่อ
 */
export async function readImageText(base64: string): Promise<string | null> {
  if (!isVisionConfigured()) {
    throw new HttpError(501, "ยังไม่ได้ตั้งค่า GOOGLE_VISION_API_KEY", "vision_not_configured");
  }

  const body = {
    requests: [
      {
        image: { content: base64 },
        // DOCUMENT_TEXT_DETECTION อ่านเอกสารที่มีบรรทัดเป็นระเบียบได้ดีกว่า TEXT_DETECTION
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
        // บอกภาษาไว้ช่วยได้มากกับสลิปไทยที่ปนตัวเลขและอังกฤษ
        imageContext: { languageHints: ["th", "en"] },
      },
    ],
  };

  let payload: VisionResponse;
  try {
    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(GOOGLE_VISION_API_KEY()!)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // อ่าน body ก่อนเช็ค status เพราะ Vision ใส่รายละเอียดข้อผิดพลาดไว้ใน JSON
    payload = (await response.json().catch(() => ({}))) as VisionResponse;

    if (!response.ok) {
      const detail = payload.error?.message ?? `HTTP ${response.status}`;
      throw new HttpError(502, `Google Vision ตอบกลับไม่สำเร็จ: ${detail}`, "vision_failed");
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    const reason = error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";
    throw new HttpError(502, `เรียก Google Vision ไม่สำเร็จ: ${reason}`, "vision_failed");
  }

  const first = payload.responses?.[0];
  if (first?.error?.message) {
    throw new HttpError(502, `Google Vision อ่านรูปไม่สำเร็จ: ${first.error.message}`, "vision_failed");
  }

  // ปกติได้จาก fullTextAnnotation ส่วน textAnnotations[0] เป็นทางสำรองที่ให้ข้อความรวมเหมือนกัน
  const text = first?.fullTextAnnotation?.text ?? first?.textAnnotations?.[0]?.description ?? "";
  return text.trim() ? text : null;
}
