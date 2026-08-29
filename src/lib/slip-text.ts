import type { Direction } from "./types";
import { parseLooseDateTime } from "./thai-date";

/**
 * แยกฟิลด์ออกจากข้อความที่ OCR อ่านได้บนสลิป/หน้าจอถอนเงิน
 *
 * แยกไฟล์ไว้ต่างหากเพราะไม่ยุ่งกับเน็ตเลย — ทดสอบด้วยข้อความดิบได้ตรง ๆ
 * และเปลี่ยนตัว OCR ข้างหลังได้โดยไม่ต้องแก้ตรงนี้
 */

export interface SlipFields {
  amount: number | null;
  fee: number | null;
  occurredAt: Date | null;
  direction: Direction | null;
  refNo: string | null;
  bankName: string | null;
  siteHint: string | null;
}

/** ป้ายกำกับที่อยู่ "หน้า" ยอดเงินของรายการ */
const AMOUNT_LABELS = [
  "จำนวนเงินโอน",
  "จำนวนเงิน",
  "ยอดเงินโอน",
  "ยอดโอน",
  "ยอดถอน",
  "จำนวน",
  "ยอดเงิน",
];

/** ป้ายกำกับที่ตัวเลขข้าง ๆ ไม่ใช่ยอดของรายการ — ห้ามหยิบมาใช้เด็ดขาด */
const EXCLUDED_LABELS = [
  "ค่าธรรมเนียม",
  "ธรรมเนียม",
  "คงเหลือ",
  "ยอดคงเหลือ",
  "เงินคงเหลือ",
  "เครดิตคงเหลือ",
  "ยอดสะสม",
  "โบนัส",
  "ส่วนลด",
  "รวมทั้งสิ้น",
];

const BANK_NAMES = [
  "กสิกรไทย",
  "ไทยพาณิชย์",
  "กรุงเทพ",
  "กรุงไทย",
  "กรุงศรีอยุธยา",
  "ทหารไทยธนชาต",
  "ออมสิน",
  "อาคารสงเคราะห์",
  "เกียรตินาคินภัทร",
  "ทิสโก้",
  "ยูโอบี",
  "ซีไอเอ็มบี",
  "แลนด์ แอนด์ เฮ้าส์",
  "ไทยเครดิต",
];

/**
 * เกลาข้อความจาก OCR ก่อนจับ pattern
 * ตัว OCR มักคืน "จ + ◌ํ + า" แทน "จำ" (นิคหิต + สระอา แทนสระอำ) ถ้าไม่รวมกลับจะ match ไม่เจอ
 */
export function normalizeThaiText(text: string): string {
  return text
    .replace(/ํา/g, "ำ") // ◌ํ + า → ำ
    .replace(/ำ/g, "ำ")
    .replace(/[​ ]/g, " ")
    .normalize("NFC");
}

/** ตัวเลขเงินต้องมีทศนิยม 2 ตำแหน่ง — กันไปหยิบวันที่หรือเลขอ้างอิงมาเป็นยอดเงิน */
const MONEY = /(\d{1,3}(?:,\d{3})+\.\d{2}|\d+\.\d{2})/;
/** สำรองสำหรับหน้าจอเว็บที่เขียน "500 บาท" เฉย ๆ ไม่มีทศนิยม */
const MONEY_LOOSE = /(\d{1,3}(?:,\d{3})+|\d+)\s*(?:บาท|฿|THB)/i;

/** ยอดของรายการต้องมากกว่า 0 เสมอ แต่ค่าธรรมเนียมเป็น 0.00 ได้ (และมักเป็น) */
function toAmount(raw: string | undefined, allowZero = false): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(value) || value > 100_000_000) return null;
  if (allowZero ? value < 0 : value <= 0) return null;
  return Math.round(value * 100) / 100;
}

function hasLabel(line: string, labels: string[]): boolean {
  return labels.some((label) => line.includes(label));
}

/**
 * หายอดเงินของรายการ
 * สลิปไทยวางตัวเลขไว้บรรทัดเดียวกับป้ายบ้าง บรรทัดถัดไปบ้าง (K PLUS เป็นแบบหลัง)
 * จึงมองทีละบรรทัดพร้อมบรรทัดถัดไปเสมอ
 */
function findAmount(lines: string[]): { amount: number | null; fee: number | null } {
  let amount: number | null = null;
  let fee: number | null = null;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1] ?? "";
    // ตัวเลขอาจอยู่บรรทัดเดียวกับป้าย หรือบรรทัดถัดไปที่ไม่มีป้ายอื่นมาคั่น
    const sameLine = line.match(MONEY)?.[1] ?? line.match(MONEY_LOOSE)?.[1];
    const nextLine = hasLabel(next, [...AMOUNT_LABELS, ...EXCLUDED_LABELS])
      ? undefined
      : (next.match(MONEY)?.[1] ?? next.match(MONEY_LOOSE)?.[1]);
    const raw = sameLine ?? nextLine;
    const isFeeLine = hasLabel(line, ["ค่าธรรมเนียม", "ธรรมเนียม"]);
    const value = toAmount(raw, isFeeLine);
    if (value === null) continue;

    if (isFeeLine) {
      if (fee === null) fee = value;
    } else if (amount === null && hasLabel(line, AMOUNT_LABELS)) {
      amount = value;
    }
  }

  // ไม่เจอป้ายเลย — เก็บทุกตัวเลขที่ไม่ได้อยู่ใกล้ป้ายต้องห้าม แล้วเอาค่ามากสุด
  if (amount === null) {
    const candidates: number[] = [];
    for (let i = 0; i < lines.length; i += 1) {
      if (hasLabel(lines[i], EXCLUDED_LABELS)) continue;
      if (i > 0 && hasLabel(lines[i - 1], EXCLUDED_LABELS) && !lines[i - 1].match(MONEY)) continue;
      const value = toAmount(lines[i].match(MONEY)?.[1]);
      if (value !== null) candidates.push(value);
    }
    if (candidates.length > 0) amount = Math.max(...candidates);
  }

  return { amount, fee };
}

/**
 * หาวันเวลาบนสลิป
 * ไล่ทีละบรรทัด (และบรรทัดคู่ เผื่อวันกับเวลาอยู่คนละบรรทัด) แทนที่จะโยนข้อความทั้งก้อนเข้าไป
 * เพราะเลขอ้างอิงยาว ๆ หลอกให้ parse เป็นวันที่ได้ง่าย
 */
function findDate(lines: string[], now: Date): Date | null {
  // สลิปย้อนหลังเกิน 10 ปีหรือล้ำหน้าไปในอนาคต แปลว่าอ่านเพี้ยน — ทิ้งดีกว่าเดา
  const earliest = new Date(now.getTime() - 10 * 365 * 24 * 3600 * 1000);
  const latest = new Date(now.getTime() + 2 * 24 * 3600 * 1000);

  for (let i = 0; i < lines.length; i += 1) {
    for (const text of [lines[i], `${lines[i]} ${lines[i + 1] ?? ""}`]) {
      const parsed = parseLooseDateTime(text);
      if (parsed && parsed >= earliest && parsed <= latest) return parsed;
    }
  }
  return null;
}

function findRefNo(lines: string[]): string | null {
  for (let i = 0; i < lines.length; i += 1) {
    if (!hasLabel(lines[i], ["เลขที่รายการ", "รหัสอ้างอิง", "เลขอ้างอิง", "หมายเลขอ้างอิง"])) continue;
    const candidate = `${lines[i]} ${lines[i + 1] ?? ""}`.match(/\b([A-Z0-9]{8,40})\b/);
    if (candidate) return candidate[1];
  }
  return null;
}

/** เว็บที่ผู้ใช้มีอยู่ ชื่อไหนโผล่ในข้อความบ้าง — ใช้เลือก dropdown ให้อัตโนมัติ */
export function matchSiteName(text: string, siteNames: string[]): string | null {
  const haystack = text.toLowerCase();
  // ชื่อยาวชนะชื่อสั้น กันกรณีชื่อเว็บหนึ่งเป็นส่วนหนึ่งของอีกชื่อ
  const sorted = [...siteNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const needle = name.trim().toLowerCase();
    if (needle.length >= 3 && haystack.includes(needle)) return name;
  }
  return null;
}

/** อ่านฟิลด์ทั้งหมดจากข้อความที่ OCR คืนมา */
export function extractSlipFields(
  rawText: string,
  options: { siteNames?: string[]; now?: Date } = {},
): SlipFields {
  const text = normalizeThaiText(rawText);
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const { amount, fee } = findAmount(lines);

  // หน้าจอถอนเงินจากเว็บไม่มี QR ให้ยืนยัน จึงต้องดูจากคำบนภาพ
  let direction: Direction | null = null;
  if (/ถอน/.test(text)) direction = "withdraw";
  else if (/โอนเงิน|โอนสำเร็จ|ทำรายการสำเร็จ|สลิป/.test(text)) direction = "deposit";

  return {
    amount,
    fee,
    occurredAt: findDate(lines, options.now ?? new Date()),
    direction,
    refNo: findRefNo(lines),
    bankName: BANK_NAMES.find((bank) => text.includes(bank)) ?? null,
    siteHint: options.siteNames ? matchSiteName(text, options.siteNames) : null,
  };
}
