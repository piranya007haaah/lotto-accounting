import jsQR from "jsqr";
import sharp, { type Sharp } from "sharp";
import { thaiBankName } from "./thai-banks";
import type { SlipQr } from "./types";

/**
 * อ่าน "QR ตรวจสอบสลิป" ที่ธนาคารไทยพิมพ์ไว้บนสลิปโอนเงิน
 *
 * ข้างใน QR เป็นข้อมูล TLV แบบเดียวกับ EMVCo เก็บรหัสธนาคารต้นทางกับเลขที่รายการ
 * (ไม่มียอดเงินและวันที่) — ถอดออกมาตรง ๆ ได้เลย ไม่ต้องพึ่งการอ่านตัวหนังสือ
 * จึงเป็นค่าที่แม่นที่สุดบนสลิปและใช้ยืนยันว่าสลิปใบนี้เคยบันทึกไปแล้วหรือยัง
 *
 *   payload ตัวอย่าง: 0041000600000101030040220016239094536DPP015375102TH910483DB
 *     00 → ข้อมูลรายการ  01 = รหัสธนาคาร (004 = กสิกรไทย)  02 = เลขที่รายการ
 *     51 → รหัสประเทศ (TH)
 *     91 → CRC ของทุกอย่างก่อนหน้า
 */

/** ด้านยาวสุดที่ใช้สแกน — สลิปย่อเหลือ 640px ยังอ่านออก ไม่ต้องสแกนภาพใหญ่ให้เปลืองแรม */
const SCAN_MAX_EDGE = 1600;

interface TlvNode {
  tag: string;
  value: string;
}

/** แตกข้อความ TLV (tag 2 ตัว + ความยาว 2 หลัก + ค่า) — คืน null ถ้าโครงสร้างไม่ครบ */
function parseTlv(payload: string): TlvNode[] | null {
  const nodes: TlvNode[] = [];
  let cursor = 0;

  while (cursor < payload.length) {
    if (cursor + 4 > payload.length) return null;
    const tag = payload.slice(cursor, cursor + 2);
    const lengthText = payload.slice(cursor + 2, cursor + 4);
    if (!/^\d{2}$/.test(lengthText)) return null;

    const end = cursor + 4 + Number(lengthText);
    if (end > payload.length) return null;

    nodes.push({ tag, value: payload.slice(cursor + 4, end) });
    cursor = end;
  }

  return nodes.length > 0 ? nodes : null;
}

function findTag(nodes: TlvNode[] | null, tag: string): string | null {
  const value = nodes?.find((node) => node.tag === tag)?.value.trim();
  return value ? value : null;
}

/** CRC-16/CCITT-FALSE — มาตรฐานเดียวกับ QR พร้อมเพย์ */
function crc16(text: string): string {
  let crc = 0xffff;
  for (let i = 0; i < text.length; i += 1) {
    crc ^= text.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * ตรวจ CRC ท้าย payload
 * คืน null ถ้าสลิปใบนั้นไม่มี CRC มาให้ตรวจ (ไม่ถือว่าผิด)
 */
function verifyCrc(payload: string): boolean | null {
  const markerAt = payload.length - 8;
  if (markerAt < 0 || payload.slice(markerAt, markerAt + 4) !== "9104") return null;
  // CRC คิดจากทุกอย่างก่อนหน้า รวม "9104" ของตัวมันเองด้วย
  return crc16(payload.slice(0, markerAt + 4)) === payload.slice(markerAt + 4).toUpperCase();
}

/** แปลง payload ที่ถอดจาก QR ให้เป็นข้อมูลสลิป — คืน null ถ้าไม่ใช่ QR ตรวจสอบสลิป */
export function parseSlipQrPayload(payload: string): SlipQr | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  const nodes = parseTlv(trimmed);
  if (!nodes) return null;

  // อ่านเพี้ยนแล้วได้เลขที่รายการผิดอันตรายกว่าอ่านไม่ออก — CRC ไม่ผ่านคือทิ้ง
  const crcVerified = verifyCrc(trimmed);
  if (crcVerified === false) return null;

  const details = parseTlv(findTag(nodes, "00") ?? "");
  const transRef = findTag(details, "02");
  if (!transRef || transRef.length < 8 || !/^[A-Za-z0-9]+$/.test(transRef)) return null;

  const bankCode = findTag(details, "01");
  const sendingBankCode = bankCode && /^\d{3}$/.test(bankCode) ? bankCode : null;

  return {
    payload: trimmed,
    transRef,
    sendingBankCode,
    sendingBankName: thaiBankName(sendingBankCode),
    countryCode: findTag(nodes, "51"),
    crcVerified: crcVerified === true,
  };
}

/** สแกนภาพหนึ่งเวอร์ชัน — คืนข้อความใน QR ที่เจอ */
async function scan(
  image: Sharp,
  inversionAttempts: "dontInvert" | "attemptBoth",
): Promise<string | null> {
  const { data, info } = await image
    .toColourspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  if (info.channels !== 4) return null;

  const pixels = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  return jsQR(pixels, info.width, info.height, { inversionAttempts })?.data ?? null;
}

/**
 * หา QR ตรวจสอบสลิปในรูป
 * ไม่ throw — รูปที่ไม่มี QR (เช่นหน้าจอถอนเงินจากเว็บ) เป็นเรื่องปกติ คืน null ไป
 */
export async function readSlipQr(buffer: Buffer): Promise<SlipQr | null> {
  try {
    const meta = await sharp(buffer, { failOn: "none" }).metadata();
    const longestEdge = Math.max(meta.width ?? 0, meta.height ?? 0);
    if (longestEdge === 0) return null;

    const fitted = () =>
      sharp(buffer, { failOn: "none" })
        .rotate()
        .resize({ width: SCAN_MAX_EDGE, height: SCAN_MAX_EDGE, fit: "inside", withoutEnlargement: true });

    const attempts: Array<() => Promise<string | null>> = [
      // 1. ตามที่เป็น — สลิปจากแอปธนาคารส่วนใหญ่จบตั้งแต่รอบนี้
      () => scan(fitted(), "dontInvert"),
      // 2. ดันคอนทราสต์ เผื่อสลิปมีลายน้ำจาง ๆ ทับ QR
      () => scan(fitted().greyscale().normalise(), "dontInvert"),
      // 3. ขยายสองเท่า เผื่อ QR เล็กมากเพราะรูปถูกย่อมาแล้ว
      () => {
        const enlarged = Math.min(longestEdge * 2, SCAN_MAX_EDGE * 2);
        return scan(
          sharp(buffer, { failOn: "none" })
            .rotate()
            .resize({ width: enlarged, height: enlarged, fit: "inside" })
            .greyscale()
            .normalise(),
          "attemptBoth",
        );
      },
    ];

    for (const attempt of attempts) {
      const payload = await attempt().catch(() => null);
      if (!payload) continue;
      const parsed = parseSlipQrPayload(payload);
      if (parsed) return parsed;
    }

    return null;
  } catch (error) {
    console.error("[slip-qr] อ่าน QR ไม่สำเร็จ:", error);
    return null;
  }
}
