/**
 * ทดสอบการอ่านสลิปด้วย Claude โดยไม่ต้องเปิดเว็บทั้งระบบ
 *
 *   ANTHROPIC_API_KEY=sk-... npx tsx scripts/ocr-smoke.ts ./slip.jpg
 *
 * ใช้ตรวจว่า prompt อ่านวันที่ (พ.ศ. → ค.ศ.) และยอดเงินได้ถูกต้องไหม
 */
import fs from "node:fs";
import path from "node:path";
import { SUPPORTED_IMAGE_TYPES, extractFromImage, type SupportedImageType } from "../src/lib/ocr";

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

  const base64 = fs.readFileSync(target).toString("base64");
  const started = Date.now();
  const result = await extractFromImage({ base64, mediaType });

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nใช้เวลา ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
  if (result.warnings.length > 0) console.log("ข้อควรตรวจ:", result.warnings.join(" | "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
