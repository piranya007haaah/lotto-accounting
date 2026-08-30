import {
  AMOUNT_LABELS,
  EXCLUDED_LABELS,
  findBank,
  includesAny,
  matchSiteName,
  normalizeThaiText,
  saneDate,
  squash,
  toLines,
  type Line,
} from "./ocr-text";
import type { Direction } from "./types";
import { parseLooseDateTime } from "./thai-date";

/**
 * แยกฟิลด์ออกจากข้อความที่ OCR อ่านได้บนสลิป/หน้าจอถอนเงิน
 *
 * แยกไฟล์ไว้ต่างหากเพราะไม่ยุ่งกับเน็ตเลย — ทดสอบด้วยข้อความดิบได้ตรง ๆ
 * (scripts/parser-check.ts) และเปลี่ยนตัว OCR ข้างหลังได้โดยไม่ต้องแก้ตรงนี้
 *
 * กติกาในไฟล์นี้ปรับมาจากข้อความจริงที่ Google Vision คืนมา ซึ่งไม่ได้เรียงตามที่ตาเห็น
 * เสมอไป — สลิป SCB บางแบบ Vision กองป้ายฝั่งซ้ายไว้ด้วยกัน แล้วค่อยตามด้วยค่าทีหลัง
 */

export interface SlipFields {
  amount: number | null;
  fee: number | null;
  occurredAt: Date | null;
  direction: Direction | null;
  refNo: string | null;
  bankName: string | null;
  counterparty: string | null;
  siteHint: string | null;
}

const FEE_LABELS = ["ค่าธรรมเนียม", "ธรรมเนียม", "fee"];

const REF_LABELS = [
  "เลขที่รายการ", "รหัสอ้างอิง", "เลขที่อ้างอิง", "หมายเลขอ้างอิง", "เลขอ้างอิง",
  "รหัสรายการ", "referenceno", "reference", "refno", "transactionid", "transid",
];

const WITHDRAW_HINTS = ["ถอนเงิน", "ถอนสำเร็จ", "รายการถอน", "แจ้งถอน", "ถอนเครดิต", "withdraw", "ถอน"];

const DEPOSIT_HINTS = [
  "โอนเงินสำเร็จ", "โอนสำเร็จ", "ชำระเงินสำเร็จ", "จ่ายเงินสำเร็จ", "ทำรายการสำเร็จ",
  "โอนเงิน", "ชำระเงิน", "จ่ายเงิน", "เติมเงิน", "ฝากเงิน", "สลิป",
  "พร้อมเพย์", "promptpay", "deposit", "transfer", "payment", "สแกนจ่าย",
];

const COUNTERPARTY_LABELS = [
  "ไปยัง", "โอนไปยัง", "ผู้รับเงิน", "ผู้รับ", "บัญชีปลายทาง", "ชื่อบัญชีปลายทาง",
  "payee", "receiver", "to",
];

/** ป้ายต้องตามด้วย ":" หรือช่องว่าง ไม่งั้นจะไปโดนประโยคอย่าง "ผู้รับเงินสามารถสแกน..." */
const COUNTERPARTY_LABEL_RE =
  /^(ชื่อบัญชีปลายทาง|บัญชีปลายทาง|โอนไปยัง|ผู้รับเงิน|ผู้รับ|ไปยัง|payee|receiver|to)/i;

/** บรรทัดที่มีแต่ชื่อป้าย ไม่ใช่ค่า — สลิปที่ Vision กองป้ายไว้ด้วยกันจะเจอแบบนี้ */
const LABEL_ONLY = new Set([
  ...AMOUNT_LABELS,
  ...REF_LABELS,
  ...COUNTERPARTY_LABELS,
  "จาก", "from", "ค่าธรรมเนียม", "ธรรมเนียม", "fee", "รหัสร้านค้า", "รหัสธุรกรรม",
  "billerid", "เลขที่บัญชี", "เลขบัญชี", "ธนาคาร", "bank",
]);

/**
 * หายอดเงินของรายการด้วยการให้คะแนนตัวเลขทุกตัวที่เจอ แทนการหยิบตัวแรกที่เข้าเค้า
 *
 * สลิปไทยวางตัวเลขไว้บรรทัดเดียวกับป้ายบ้าง บรรทัดถัดไปบ้าง (K PLUS เป็นแบบหลัง)
 * และบางใบ Vision โยนยอดไปไว้ท้ายสุดห่างจากป้ายไปเลย การให้คะแนนจึงทนกว่า:
 * ตัวที่มีป้ายกำกับ + มีหน่วยบาท + มีทศนิยม ชนะเสมอ ส่วนเลขโดด ๆ ที่ไม่มีอะไรกำกับ
 * ต้องมีทศนิยมหรือคอมมาถึงจะถูกนับ
 */
function findAmount(lines: Line[], now: Date): { amount: number | null; fee: number | null } {
  let best: { value: number; score: number } | null = null;
  let fee: number | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (fee === null && includesAny(line.squashed, FEE_LABELS)) {
      const here = line.numbers[0] ?? lines[index + 1]?.numbers[0];
      if (here && here.value >= 0) fee = Math.round(here.value * 100) / 100;
    }

    if (includesAny(line.squashed, EXCLUDED_LABELS)) continue;
    // บรรทัดที่เป็นวันที่ล้วน ๆ ไม่ใช่ยอดเงินแน่นอน
    if (line.numbers.length > 0 && saneDate(parseLooseDateTime(line.text), now)) continue;

    const labeledHere = includesAny(line.squashed, AMOUNT_LABELS);
    const previous = index > 0 ? lines[index - 1] : null;
    // รูปแบบ "จำนวนเงิน:" อยู่บรรทัดบน แล้วตัวเลขอยู่บรรทัดล่าง
    const labeledAbove = Boolean(
      previous &&
        previous.numbers.length === 0 &&
        includesAny(previous.squashed, AMOUNT_LABELS) &&
        !includesAny(previous.squashed, EXCLUDED_LABELS),
    );
    const hasCurrency = includesAny(line.squashed, ["บาท", "thb"]) || line.text.includes("฿");

    for (const { raw, value } of line.numbers) {
      if (value <= 0 || value > 10_000_000) continue;

      let score = 0;
      if (labeledHere) score += 5;
      if (labeledAbove) score += 4;
      if (hasCurrency) score += 2;
      if (/\.\d{2}$/.test(raw)) score += 2;
      if (raw.includes(",")) score += 1;
      // เลขโดด ๆ ไม่มีทศนิยม ไม่มีคอมมา ไม่มีคำกำกับ — เชื่อไม่ได้
      if (!labeledHere && !labeledAbove && !hasCurrency && !/[,.]/.test(raw)) score -= 2;
      // ช่วงที่มักเป็นเลขปี
      if (!raw.includes(".") && value >= 1900 && value <= 2700) score -= 3;

      if (score <= 0) continue;
      if (best === null || score > best.score) best = { value, score };
    }
  }

  return { amount: best === null ? null : Math.round(best.value * 100) / 100, fee };
}

/**
 * เวลาบนสลิป — รับ "17:02" ตรง ๆ ส่วนแบบจุดต้องมี "น." กำกับ ไม่งั้น "0.00 บาท"
 * ของบรรทัดค่าธรรมเนียมจะถูกนับเป็นเวลา 0:00
 */
const TIME_TOKEN = /(?<!\d)(?:\d{1,2}:\d{2}(?::\d{2})?|\d{1,2}\.\d{2}\s*น\.?)(?!\d)/;

/**
 * หาวันเวลาบนสลิป
 * ไล่ทีละบรรทัดแทนที่จะโยนข้อความทั้งก้อนเข้าไป เพราะเลขอ้างอิงยาว ๆ หลอกให้
 * parse เป็นวันที่ได้ง่าย และเลือกบรรทัดที่ "มีเวลากำกับ" ก่อนเสมอ — K PLUS วาง
 * วันที่กับเวลาไว้คนละบรรทัด ถ้าคืนบรรทัดแรกที่ parse ได้เลยจะได้เวลา 00:00 ทุกใบ
 */
function findDate(lines: Line[], now: Date): Date | null {
  let fallback: Date | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const own = saneDate(parseLooseDateTime(line.text), now);
    if (!own) continue;

    if (TIME_TOKEN.test(line.text)) return own;

    const next = lines[index + 1];
    if (next && TIME_TOKEN.test(next.text)) {
      const withNext = saneDate(parseLooseDateTime(`${line.text} ${next.text}`), now);
      if (withNext) return withNext;
    }

    fallback ??= own;
  }

  return fallback;
}

/** เลขที่รายการปนตัวพิมพ์เล็กได้ (SCB ใช้ทั้งเลขและอักษรคละกัน เช่น 202608291xrFELgRCjD9g32Py) */
function findRefNo(lines: Line[]): string | null {
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!includesAny(line.squashed, REF_LABELS) && !line.squashed.startsWith("ref")) continue;
    // ตัดคำว่า No / ID ที่ตามหลังป้ายออกก่อน ไม่งั้นจะถูกนับเป็นส่วนหนึ่งของเลข
    const here = line.text.replace(/[A-Za-z]+\s*(no|id)\.?/i, " ").match(/[A-Za-z0-9]{8,40}/)?.[0];
    if (here) return here;
    const there = lines[index + 1]?.text.match(/[A-Za-z0-9]{8,40}/)?.[0];
    if (there) return there;
  }
  return null;
}

function findCounterparty(lines: Line[]): string | null {
  const clean = (value: string): string | null => {
    const trimmed = value.replace(/^[\s:：\-]+/, "").trim();
    if (trimmed.length < 3) return null;
    // ตัวเลขล้วนหรือเลขบัญชีที่ถูกปิดบัง ไม่ใช่ชื่อคน
    if (!/[A-Za-z฀-๿]/.test(trimmed)) return null;
    // บรรทัดที่เป็นชื่อป้ายเฉย ๆ (เช่น "จำนวนเงิน") ไม่ใช่ชื่อผู้รับ
    if (LABEL_ONLY.has(squash(trimmed))) return null;
    return trimmed.slice(0, 200);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = line.text.match(COUNTERPARTY_LABEL_RE)?.[1];
    if (!label) continue;

    const after = line.text.slice(label.length);
    if (after !== "" && !/^[\s:：]/.test(after)) continue;

    const rest = after.replace(/^[\s:：]+/, "").trim();
    if (rest) {
      const here = clean(rest);
      if (here) return here;
      continue;
    }

    // ป้ายอยู่บรรทัดเดียวโดด ๆ — ชื่อผู้รับน่าจะอยู่บรรทัดถัดไป
    const there = lines[index + 1] ? clean(lines[index + 1].text) : null;
    if (there) return there;
  }
  return null;
}

/** อ่านฟิลด์ทั้งหมดจากข้อความที่ OCR คืนมา */
export function extractSlipFields(
  rawText: string,
  options: { siteNames?: string[]; now?: Date } = {},
): SlipFields {
  const now = options.now ?? new Date();
  const text = normalizeThaiText(rawText);
  const lines = toLines(text);
  const squashedAll = squash(text);

  const { amount, fee } = findAmount(lines, now);

  // หน้าจอถอนเงินจากเว็บไม่มี QR ให้ยืนยัน จึงต้องดูจากคำบนภาพ
  const bankName = findBank(squashedAll);
  let direction: Direction | null = null;
  if (includesAny(squashedAll, WITHDRAW_HINTS)) direction = "withdraw";
  else if (includesAny(squashedAll, DEPOSIT_HINTS) || bankName) direction = "deposit";

  return {
    amount,
    fee,
    occurredAt: findDate(lines, now),
    direction,
    refNo: findRefNo(lines),
    bankName,
    counterparty: findCounterparty(lines),
    siteHint: options.siteNames ? matchSiteName(text, options.siteNames) : null,
  };
}
