/**
 * เครื่องมือพื้นฐานสำหรับแกะข้อความที่ OCR อ่านได้
 *
 * แยกออกมาจาก slip-text.ts เพราะตอนนี้มีตัวแกะสองแบบที่ใช้กติกาเดียวกัน
 *   - slip-text.ts  สลิปโอนเงินของธนาคาร
 *   - web-page.ts   หน้าฝาก/ถอนของเว็บหวย
 * ไฟล์นี้ไม่ยุ่งกับเน็ตเลย ทดสอบด้วยข้อความดิบได้ตรง ๆ
 */

/** ป้ายกำกับที่อยู่ "หน้า" ยอดเงินของรายการ (เทียบแบบตัดช่องว่างออกแล้ว) */
export const AMOUNT_LABELS = [
  "จำนวนเงินโอน", "จำนวนเงิน", "จำนวนที่โอน", "จำนวนที่ถอน", "จำนวน",
  "ยอดเงินโอน", "ยอดโอน", "ยอดถอน", "ยอดฝาก", "ยอดที่ถอน", "ยอดเงิน",
  "amount", "totalamount", "transferamount",
];

/** ป้ายกำกับที่ตัวเลขข้าง ๆ ไม่ใช่ยอดของรายการ — ห้ามหยิบมาใช้เด็ดขาด */
export const EXCLUDED_LABELS = [
  "คงเหลือ", "ค่าธรรมเนียม", "ธรรมเนียม", "ยอดสะสม", "สะสม", "โบนัส", "ส่วนลด",
  "รวมทั้งสิ้น", "เครดิต", "แต้ม", "วงเงิน", "เลขที่บัญชี", "เลขบัญชี", "โทร",
  "balance", "available", "fee", "bonus", "credit", "point", "limit", "tel",
];

/**
 * ชื่อธนาคารที่อาจโผล่บนภาพ — เทียบทั้งชื่อไทยและชื่อย่ออังกฤษ เพราะสลิปบางใบ
 * Vision อ่านได้แต่โลโก้อังกฤษ (สลิป SCB จ่ายบิลไม่มีคำว่า "ไทยพาณิชย์" บนหน้าเลย)
 *
 * เรียงจากชื่อที่เจาะจงกว่าไปหาชื่อสั้น เพราะเทียบแบบ substring — "bangkokbank"
 * มีคำว่า "kbank" อยู่ข้างใน ถ้าสลับลำดับจะกลายเป็นกสิกรไทย
 */
const BANKS: Array<[string[], string]> = [
  [["ธนาคารกรุงเทพ", "bangkokbank", "bualuang", "bbl"], "กรุงเทพ"],
  [["กสิกรไทย", "kasikorn", "kbank", "kplus"], "กสิกรไทย"],
  [["ไทยพาณิชย์", "siamcommercial", "scbeasy", "scb"], "ไทยพาณิชย์"],
  [["กรุงไทย", "krungthai", "เป๋าตัง", "ktb"], "กรุงไทย"],
  [["กรุงศรีอยุธยา", "กรุงศรี", "krungsri", "ayudhya"], "กรุงศรีอยุธยา"],
  [["ทหารไทยธนชาต", "thanachart", "ttb", "tmb"], "ทหารไทยธนชาต (ttb)"],
  [["ออมสิน", "gsb"], "ออมสิน"],
  [["อาคารสงเคราะห์", "ghbank"], "อาคารสงเคราะห์"],
  [["เพื่อการเกษตร", "ธกส", "baac"], "ธ.ก.ส."],
  [["ซีไอเอ็มบี", "cimb"], "ซีไอเอ็มบี ไทย"],
  [["ยูโอบี", "uob"], "ยูโอบี"],
  [["แลนด์แอนด์เฮ้าส์", "lhbank"], "แลนด์ แอนด์ เฮ้าส์"],
  [["เกียรตินาคิน", "kkp"], "เกียรตินาคินภัทร"],
  [["ทิสโก้", "tisco"], "ทิสโก้"],
  [["ไทยเครดิต", "thaicredit"], "ไทยเครดิต"],
  [["อิสลามแห่งประเทศไทย", "ibank"], "อิสลามแห่งประเทศไทย"],
  [["ทรูมันนี่", "truemoney", "truewallet"], "ทรูมันนี่ วอลเล็ท"],
];

/** ตัวเลขที่ไม่ได้ติดกับ วันที่ / เวลา / เลขบัญชีที่คั่นด้วยขีด */
export const NUMBER_TOKEN =
  /(?<![\d/\-:.])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d/\-:])/g;

/**
 * เกลาข้อความจาก OCR ก่อนจับ pattern
 * ตัว OCR มักคืน "จ + ◌ํ + า" แทน "จำ" (นิคหิต + สระอา แทนสระอำ) ถ้าไม่รวมกลับจะ match ไม่เจอ
 * และสลิปบางใบพิมพ์เลขไทย จึงแปลงเป็นเลขอารบิกให้หมดก่อน
 */
export function normalizeThaiText(text: string): string {
  return text
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    .replace(/ํา/g, "ำ") // ◌ํ + า → ำ
    .replace(/เเ/g, "แ") // เ + เ → แ
    .replace(/[​ ]/g, " ")
    .normalize("NFC");
}

/** ตัดช่องว่างและเครื่องหมายออก เพื่อเทียบคำสำคัญโดยไม่แคร์การเว้นวรรคของ OCR */
export function squash(value: string): string {
  return value.replace(/[\s.\-_:()฿]/g, "").toLowerCase();
}

export function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

export interface Line {
  text: string;
  squashed: string;
  numbers: Array<{ raw: string; value: number }>;
}

export function toLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const numbers: Array<{ raw: string; value: number }> = [];
      for (const match of line.matchAll(NUMBER_TOKEN)) {
        const value = Number(match[1].replace(/,/g, ""));
        if (Number.isFinite(value)) numbers.push({ raw: match[1], value });
      }
      return { text: line, squashed: squash(line), numbers };
    });
}

/** กันวันที่เพี้ยนจากการอ่านเลขบัญชี/เบอร์โทรผิดเป็นวันที่ */
export function saneDate(date: Date | null, now: Date): Date | null {
  if (!date) return null;
  const earliest = now.getTime() - 10 * 365 * 24 * 3600 * 1000;
  const latest = now.getTime() + 2 * 24 * 3600 * 1000;
  const time = date.getTime();
  return time >= earliest && time <= latest ? date : null;
}

/** ชื่อธนาคารที่พบในข้อความ (ต้อง squash มาก่อน) — ไม่เจอก็คืน null ไม่ต้องเดา */
export function findBank(squashedText: string): string | null {
  for (const [keywords, name] of BANKS) {
    if (includesAny(squashedText, keywords)) return name;
  }
  return null;
}

/** เว็บที่ผู้ใช้มีอยู่ ชื่อไหนโผล่ในข้อความบ้าง — ใช้เลือก dropdown ให้อัตโนมัติ */
export function matchSiteName(text: string, siteNames: string[]): string | null {
  const haystack = squash(text);
  // ชื่อยาวชนะชื่อสั้น กันกรณีชื่อเว็บหนึ่งเป็นส่วนหนึ่งของอีกชื่อ
  const sorted = [...siteNames].sort((a, b) => b.length - a.length);
  for (const name of sorted) {
    const needle = squash(name);
    if (needle.length >= 3 && haystack.includes(needle)) return name;
  }
  return null;
}
