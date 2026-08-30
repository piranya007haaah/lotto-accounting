/**
 * ทดสอบการอ่านรูปโดยไม่ต้องเปิดเว็บทั้งระบบ — ใช้ได้ทั้งสลิปธนาคารและภาพหน้าฝาก/ถอนของเว็บ
 *
 *   npx tsx scripts/ocr-smoke.ts ./slip.jpg
 *
 * อ่าน GOOGLE_VISION_API_KEY จาก .env.local ให้เอง ถ้าไม่มีคีย์จะเหลือแค่ชั้น QR
 * ใช้ตรวจว่าถอด QR ได้ไหม อ่านวันที่ (พ.ศ. → ค.ศ.) กับยอดเงินถูกไหม
 * และภาพหน้าเว็บอ่านชื่อเว็บ/เลขบัญชีออกครบไหม — พิมพ์ข้อความดิบจาก Vision ให้ดูด้วย
 */
import fs from "node:fs";
import path from "node:path";

import { SUPPORTED_IMAGE_TYPES, readTextFromImage, slipResultFromText, type SupportedImageType } from "../src/lib/ocr";
import { classifyDocument } from "../src/lib/pairing";
import { readSlipQr } from "../src/lib/slip-qr";
import { extractWebPageFields } from "../src/lib/web-page";

// ต้องโหลดก่อนเรียก extractFromImage — env.ts อ่านคีย์ตอนถูกเรียก ไม่ใช่ตอน import
loadEnvLocal();

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
  const { text, warning } = await readTextFromImage(buffer);
  if (warning) console.log(`\n— Vision —\n${warning}`);
  if (text) console.log(`\n— ข้อความดิบจาก Vision —\n${text}`);

  const kind = classifyDocument({ text, qr });
  console.log(`\n— รูปนี้คือ: ${kind === "web" ? "หน้าฝาก/ถอนของเว็บ" : "สลิปธนาคาร"} —`);

  if (kind === "web") {
    console.log(JSON.stringify(extractWebPageFields(text ?? ""), null, 2));
  } else {
    const result = slipResultFromText({ text, qr, warnings: warning ? [warning] : [] });
    if (!result) console.log("อ่านรูปนี้ไม่ออกเลย — ไม่มีทั้ง QR และตัวหนังสือที่ใช้ได้");
    else {
      console.log(`(sources = ${result.sources.join(" → ")})`);
      console.log(JSON.stringify(result, null, 2));
      if (result.warnings.length > 0) console.log("ข้อควรตรวจ:", result.warnings.join(" | "));
    }
  }
  console.log(`\nใช้เวลาทั้งหมด ${((Date.now() - started) / 1000).toFixed(1)} วินาที`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
