/**
 * ทดสอบการอ่านสลิปโดยไม่ต้องเปิดเว็บทั้งระบบ
 *
 *   npx tsx scripts/ocr-smoke.ts ./slip.jpg           # อ่านครบทุกฟิลด์
 *   npx tsx scripts/ocr-smoke.ts ./slip.jpg --text    # ดูข้อความดิบที่ Vision อ่านได้
 *
 * อ่านค่า key จาก .env.local ให้อัตโนมัติ (หรือจะส่งทาง env ตอนสั่งก็ได้)
 * ใช้ตรวจว่าอ่านวันที่ (พ.ศ. → ค.ศ.) และยอดเงินได้ถูกต้องไหม
 */
import fs from "node:fs";
import path from "node:path";
import type { SupportedImageType } from "../src/lib/ocr-extraction";

loadEnvLocal();

const EXT_TO_TYPE: Record<string, SupportedImageType> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

/** โหลด .env.local เองเพราะ tsx ไม่ได้อ่านให้เหมือนตอนรันผ่าน next */
function loadEnvLocal() {
  const file = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    const value = match[2].trim().replace(/^["']|["']$/g, "");
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}

async function main() {
  // import ทีหลังเพื่อให้โมดูลอ่านค่าจาก .env.local ที่เพิ่งโหลดเข้ามาได้
  const { resolveOcrProvider } = await import("../src/lib/env");
  const { SUPPORTED_IMAGE_TYPES, extractFromImage } = await import("../src/lib/ocr");

  const args = process.argv.slice(2);
  const textOnly = args.includes("--text");
  const target = args.find((arg) => !arg.startsWith("--"));

  if (!target) {
    console.error("ใช้งาน: npx tsx scripts/ocr-smoke.ts <ไฟล์รูป> [--text]");
    process.exit(1);
  }

  const mediaType = EXT_TO_TYPE[path.extname(target).toLowerCase()];
  if (!mediaType) {
    console.error(`นามสกุลไฟล์ไม่รองรับ — ใช้ได้: ${SUPPORTED_IMAGE_TYPES.join(", ")}`);
    process.exit(1);
  }

  const provider = resolveOcrProvider();
  if (!provider) {
    console.error("ยังไม่ได้ตั้ง GOOGLE_VISION_API_KEY หรือ ANTHROPIC_API_KEY");
    process.exit(1);
  }
  console.log(`ตัวอ่าน: ${provider}\n`);

  const base64 = fs.readFileSync(target).toString("base64");
  const started = Date.now();

  if (textOnly) {
    if (provider !== "google") {
      console.error("--text ใช้ได้เฉพาะตอนใช้ Google Vision");
      process.exit(1);
    }
    const { readTextFromImage } = await import("../src/lib/ocr-google");
    console.log(await readTextFromImage(base64));
    console.log(`\nใช้เวลา ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
    return;
  }

  const result = await extractFromImage({ base64, mediaType });

  console.log(JSON.stringify(result, null, 2));
  console.log(`\nใช้เวลา ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
  if (result.warnings.length > 0) console.log("ข้อควรตรวจ:", result.warnings.join(" | "));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
