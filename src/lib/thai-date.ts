import { APP_TIMEZONE } from "./env";

/**
 * ตัวช่วยเรื่องวันเวลา — ทุกอย่างในระบบเก็บเป็น UTC (timestamptz)
 * แต่การ "ตัดยอด" รายวัน/รายเดือน และการแสดงผลใช้เวลาไทยเสมอ
 */

const THAI_MONTH_TOKENS: Array<[string[], number]> = [
  [["มกราคม", "มกรา", "มค"], 1],
  [["กุมภาพันธ์", "กุมภา", "กพ"], 2],
  [["มีนาคม", "มีนา", "มีค"], 3],
  [["เมษายน", "เมษา", "เมย"], 4],
  [["พฤษภาคม", "พฤษภา", "พค"], 5],
  [["มิถุนายน", "มิถุนา", "มิย"], 6],
  [["กรกฎาคม", "กรกฎา", "กค"], 7],
  [["สิงหาคม", "สิงหา", "สค"], 8],
  [["กันยายน", "กันยา", "กย"], 9],
  [["ตุลาคม", "ตุลา", "ตค"], 10],
  [["พฤศจิกายน", "พฤศจิกา", "พย"], 11],
  [["ธันวาคม", "ธันวา", "ธค"], 12],
];

const EN_MONTH_TOKENS: Array<[string[], number]> = [
  [["january", "jan"], 1],
  [["february", "feb"], 2],
  [["march", "mar"], 3],
  [["april", "apr"], 4],
  [["may"], 5],
  [["june", "jun"], 6],
  [["july", "jul"], 7],
  [["august", "aug"], 8],
  [["september", "sept", "sep"], 9],
  [["october", "oct"], 10],
  [["november", "nov"], 11],
  [["december", "dec"], 12],
];

export const THAI_MONTH_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** แตกวันเวลาออกเป็นส่วน ๆ ตามโซนเวลาที่กำหนด */
export function zonedParts(date: Date, timeZone: string = APP_TIMEZONE): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

function offsetMinutes(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** สร้าง Date จากเวลาท้องถิ่น เช่น "2026-08-25T14:30" ให้เป็นเวลาจริง (UTC instant) */
export function fromZonedISO(local: string, timeZone: string = APP_TIMEZONE): Date {
  const match = local.trim().match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!match) throw new Error(`รูปแบบวันเวลาไม่ถูกต้อง: ${local}`);
  const [, y, mo, d, h, mi, s] = match;
  const naive = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0));
  // วนสองรอบเพื่อให้ได้ offset ที่ถูกต้อง (รองรับโซนเวลาที่มี DST)
  let timestamp = naive;
  for (let i = 0; i < 2; i += 1) {
    timestamp = naive - offsetMinutes(new Date(timestamp), timeZone) * 60000;
  }
  return new Date(timestamp);
}

export function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** "YYYY-MM-DD" ตามเวลาไทย */
export function formatDateKey(date: Date, timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/** "YYYY-MM" ตามเวลาไทย */
export function formatMonthKey(date: Date, timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}`;
}

/** ค่าสำหรับ <input type="datetime-local"> */
export function toDatetimeLocalValue(date: Date, timeZone: string = APP_TIMEZONE): string {
  const p = zonedParts(date, timeZone);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}T${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function todayKey(timeZone: string = APP_TIMEZONE): string {
  return formatDateKey(new Date(), timeZone);
}

export function currentMonthKey(timeZone: string = APP_TIMEZONE): string {
  return formatMonthKey(new Date(), timeZone);
}

/**
 * แปลงปีให้เป็น ค.ศ. เสมอ
 *  - 4 หลักและ >= 2400 → พ.ศ. ลบ 543
 *  - 2 หลัก → เดาว่าเป็น พ.ศ. หรือ ค.ศ. โดยเลือกอันที่ใกล้ปีปัจจุบันที่สุด
 */
export function normalizeEraYear(year: number, reference: Date = new Date()): number {
  const nowYear = reference.getUTCFullYear();
  if (year >= 2400) return year - 543;
  if (year >= 1000) return year;
  if (year < 100) {
    const asBuddhist = 2500 + year - 543;
    const asGregorian = 2000 + year;
    const okBuddhist = asBuddhist >= nowYear - 10 && asBuddhist <= nowYear + 1;
    const okGregorian = asGregorian >= nowYear - 10 && asGregorian <= nowYear + 1;
    if (okBuddhist && !okGregorian) return asBuddhist;
    if (okGregorian && !okBuddhist) return asGregorian;
    return Math.abs(asBuddhist - nowYear) <= Math.abs(asGregorian - nowYear) ? asBuddhist : asGregorian;
  }
  return year;
}

function normalizeThaiToken(token: string): string {
  return token.replace(/[.\s\u200b\u00a0]/g, "");
}

function monthFromToken(token: string): number | null {
  const thai = normalizeThaiToken(token);
  for (const [aliases, month] of THAI_MONTH_TOKENS) {
    if (aliases.includes(thai)) return month;
  }
  const english = token.toLowerCase().replace(/[.\s]/g, "");
  for (const [aliases, month] of EN_MONTH_TOKENS) {
    if (aliases.includes(english)) return month;
  }
  return null;
}

function extractTime(text: string): { hour: number; minute: number; second: number } {
  const match = text.match(/(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?\s*(น\.?|am|pm|AM|PM)?/);
  if (!match) return { hour: 0, minute: 0, second: 0 };
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const second = Number(match[3] ?? 0);
  const suffix = (match[4] ?? "").toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return { hour: 0, minute: 0, second: 0 };
  return { hour, minute, second };
}

/**
 * อ่านวันเวลาจากข้อความอิสระที่พบบนสลิป เช่น
 *   "25 ส.ค. 2569 14:30 น."  |  "25/08/69 14:30"  |  "2026-08-25T14:30:00+07:00"
 * คืนค่า null ถ้าอ่านไม่ออก
 */
export function parseLooseDateTime(
  input: string | null | undefined,
  timeZone: string = APP_TIMEZONE,
): Date | null {
  if (!input) return null;
  const text = input.trim();
  if (!text) return null;

  // 1) ISO ที่มี timezone offset มาด้วย — เชื่อได้เลย
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/.test(text)) {
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const time = extractTime(text);

  // 2) YYYY-MM-DD (ปีอาจเป็น พ.ศ.)
  const isoLike = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoLike) {
    const year = normalizeEraYear(Number(isoLike[1]));
    return buildDate(year, Number(isoLike[2]), Number(isoLike[3]), time, timeZone);
  }

  // 3) DD/MM/YYYY หรือ DD-MM-YY
  const dmy = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/);
  if (dmy) {
    const year = normalizeEraYear(Number(dmy[3]));
    return buildDate(year, Number(dmy[2]), Number(dmy[1]), time, timeZone);
  }

  // 4) DD ชื่อเดือน YYYY — คั่นด้วยช่องว่าง ขีด หรือจุดก็ได้ ("26 ส.ค. 69", "26-Aug-2026")
  const named = text.match(/(\d{1,2})[\s\-./]*([\u0E00-\u0E7F.]+|[A-Za-z.]+)[\s\-./]*(\d{2,4})/);
  if (named) {
    const month = monthFromToken(named[2]);
    if (month) {
      const year = normalizeEraYear(Number(named[3]));
      return buildDate(year, month, Number(named[1]), time, timeZone);
    }
  }

  return null;
}

function buildDate(
  year: number,
  month: number,
  day: number,
  time: { hour: number; minute: number; second: number },
  timeZone: string,
): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const local = `${year}-${pad2(month)}-${pad2(day)}T${pad2(time.hour)}:${pad2(time.minute)}:${pad2(time.second)}`;
  try {
    const date = fromZonedISO(local, timeZone);
    return Number.isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/** ช่วงเวลาของ 1 วัน (ปลายทางเป็นแบบไม่รวม) */
export function dayRange(dateKey: string, timeZone: string = APP_TIMEZONE) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const start = fromZonedISO(`${dateKey}T00:00:00`, timeZone);
  const nextKey = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  const end = fromZonedISO(`${nextKey}T00:00:00`, timeZone);
  return { start, end };
}

/** ช่วงเวลาของ 1 เดือน จาก "YYYY-MM" (ปลายทางเป็นแบบไม่รวม) */
export function monthRange(monthKey: string, timeZone: string = APP_TIMEZONE) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = fromZonedISO(`${year}-${pad2(month)}-01T00:00:00`, timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = fromZonedISO(`${nextYear}-${pad2(nextMonth)}-01T00:00:00`, timeZone);
  return { start, end };
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split("-").map(Number);
  const total = year * 12 + (month - 1) + delta;
  return `${Math.floor(total / 12)}-${pad2((total % 12) + 1)}`;
}

/** ไล่รายชื่อวันตั้งแต่ from ถึง to (รวมปลายทาง) */
export function eachDateKey(fromKey: string, toKey: string): string[] {
  const keys: string[] = [];
  const cursor = new Date(`${fromKey}T00:00:00Z`);
  const last = new Date(`${toKey}T00:00:00Z`);
  while (cursor.getTime() <= last.getTime() && keys.length < 400) {
    keys.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return keys;
}

/** "25 ส.ค. 2569" — ปีพุทธศักราชตามที่คนไทยคุ้นเคย */
export function formatThaiDate(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const p = zonedParts(date, timeZone);
  return `${p.day} ${THAI_MONTH_SHORT[p.month - 1]} ${p.year + 543}`;
}

export function formatThaiDateTime(value: string | Date, timeZone: string = APP_TIMEZONE): string {
  const date = typeof value === "string" ? new Date(value) : value;
  const p = zonedParts(date, timeZone);
  return `${formatThaiDate(date, timeZone)} ${pad2(p.hour)}:${pad2(p.minute)} น.`;
}

/** "ส.ค. 2569" จาก "2026-08" */
export function formatThaiMonth(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  return `${THAI_MONTH_SHORT[month - 1]} ${year + 543}`;
}
