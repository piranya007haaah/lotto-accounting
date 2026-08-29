/**
 * ทดสอบการอ่านสลิปโดยไม่ต้องเปิดเว็บทั้งระบบ
 *
 *   npx tsx scripts/ocr-smoke.ts ./slip.jpg                            → QR อย่างเดียว
 *   GOOGLE_VISION_API_KEY=... npx tsx scripts/ocr-smoke.ts ./slip.jpg  → QR + Vision (เส้นทางจริง)
 *   เพิ่ม ANTHROPIC_API_KEY=sk-... เพื่อทดสอบตัวสำรองด้วย
 *
 * ใช้ตรวจว่าถอด QR ได้ไหม และอ่านวันที่ (พ.ศ. → ค.ศ.) กับยอดเงินถูกต้องไหม
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_IMAGE_TYPES, extractFromImage, type SupportedImageType } from "../src/lib/ocr";
import { readSlipQr } from "../src/lib/slip-qr";

const EXT_TO_TYPE: Record<string, SupportedImageType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error("ใช้งาน: npx tsx scripts/ocr-smoke.ts <ไฟล์รูป>");
    process.exit(1);
  }

  const mediaType = EXT_TO_TYPE[path.extname(target).toLowerCase()];
  if (!mediaType) {
    console.error(`นามสกุลไฟล์ไม่รองรับ — ใช้ได้: ${SUPPORTED_IMAGE_TYPES.join(", ")}`);
    process.exit(1);
  }

  const buffer = fs.readFileSync(target);

  const qrStarted = Date.now();
  const qr = await readSlipQr(buffer);
  console.log(`— QR ตรวจสอบสลิป (${((Date.now() - qrStarted) / 1000).toFixed(2)} วินาที) —`);
  console.log(qr ? JSON.stringify(qr, null, 2) : "ไม่พบ QR ตรวจสอบสลิปในรูปนี้");

  const started = Date.now();
  const result = await extractFromImage({ buffer, mediaType, qr });

  console.log(`\n— ผลรวมที่จะเติมลงฟอร์ม (sources = ${result.sources.join(" → ")}) —`);
  console.log(JSON.stringify(result, null, 2));
  console.log(`\nใช้เวลาทั้งหมด ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
  if (result.warnings.length > 0) console.log("ข้อควรตรวจ:", result.warnings.join(" | "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
