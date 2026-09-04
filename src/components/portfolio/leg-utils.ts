/**
 * ตัวช่วยของหน้าแก้พอร์ต — แปลงข้อความเป็นชุดเลข และคิดค่าที่ต้อง "สอดคล้องกันเอง"
 * ภายในขาหนึ่ง (`n_bet` / `manual_nums` / `manual_months`)
 *
 * ⚠️ กติกาแปลงเลขยกมาจาก `page_utils.parse_numbers` ของแอป Streamlit ทั้งดุ้น —
 * ถ้าที่นี่แปลงไม่เหมือนกัน พอร์ตเดียวกันจะได้คนละชุดเลขในสองแอปโดยไม่มีใครรู้
 *
 * ⚠️⚠️ ขาที่ตั้งเลข **แยกรายเดือน**: เดือนที่ไม่มีคีย์ = **ไม่แทงเดือนนั้น**
 * (n=0 · ต้นทุน 0 · กำไร 0) ไม่ใช่ "ใช้เลขทั้งปีแทน" — ทุกที่ที่แตะ `manual_months`
 * ต้องคิดแบบนี้เสมอ และหน้าจอต้องพูดออกมาให้ชัด ไม่ใช่ปล่อยให้เดา
 */

import type { PortfolioConfig, PortfolioLegConfig } from "@/lib/lottery/portfolio-config";

export const MONTH_SHORT = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
] as const;

export const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function monthName(month: number | string): string {
  const index = Number(month) - 1;
  return MONTH_SHORT[index] ?? String(month);
}

/* ─────────────────────────── แปลงข้อความ → ชุดเลข ─────────────────────────── */

export interface ParsedNumbers {
  /** เลขที่ใช้ได้ เรียงตามลำดับที่พิมพ์ ไม่มีตัวซ้ำ */
  numbers: string[];
  /** ข้อความที่แปลงไม่ได้ — โชว์ให้เห็น ไม่ใช่ทิ้งเงียบ ๆ แล้วให้คนงงว่าเลขหาย */
  invalid: string[];
  /** จำนวนตัวซ้ำที่ตัดออก */
  duplicates: number;
}

/**
 * 1 ก้อนข้อความ → เลขกี่ตัว
 * - สั้นกว่าจำนวนหลัก = เติม 0 ข้างหน้า ("7" → "07") เหมือน `zfill` ฝั่งโน้น
 * - ยาวเป็นจำนวนเท่า = แปะติดกันมา ("124578" → 12 45 78) เพราะช่องกรอกบอกว่า paste ติดกันได้
 * - นอกนั้นคืน null = แปลงไม่ได้
 */
function chunkToken(token: string, digits: number): string[] | null {
  if (!/^\d+$/.test(token)) return null;
  if (token.length <= digits) return [token.padStart(digits, "0")];
  if (token.length % digits !== 0) return null;
  return token.match(new RegExp(`\\d{${digits}}`, "g"));
}

export function parseNumbers(text: string, digits: number): ParsedNumbers {
  const seen = new Set<string>();
  const numbers: string[] = [];
  const invalid: string[] = [];
  let duplicates = 0;

  for (const token of text.split(/[\s,]+/)) {
    if (!token) continue;
    const pieces = chunkToken(token, digits);
    if (!pieces) {
      invalid.push(token);
      continue;
    }
    for (const piece of pieces) {
      if (seen.has(piece)) {
        duplicates += 1;
        continue;
      }
      seen.add(piece);
      numbers.push(piece);
    }
  }
  return { numbers, invalid, duplicates };
}

export function joinNumbers(numbers: readonly string[]): string {
  return numbers.join(" ");
}

/* ─────────────────────────── อ่านค่าออกจากตัวขา ─────────────────────────── */

/** จำนวนหลักของขา (ไม่ส่งมา = 2 ตามพอร์ตเก่า) */
export function legDigits(leg: PortfolioLegConfig): number {
  return leg.digits ?? 2;
}

/** true = ขานี้ตั้งเลขแยกรายเดือน (มีคีย์ `manual_months` แม้จะว่าง) */
export function isMonthly(leg: PortfolioLegConfig): boolean {
  return leg.manual_months !== undefined;
}

/** เดือนที่ขานี้แทงจริง เรียง 1→12 */
export function bettingMonths(leg: PortfolioLegConfig): number[] {
  const months = leg.manual_months ?? {};
  return Object.entries(months)
    .filter(([, numbers]) => numbers.length > 0)
    .map(([month]) => Number(month))
    .filter((month) => month >= 1 && month <= 12)
    .sort((a, b) => a - b);
}

/** true = ขานี้เจาะจงเดือนของปี train/test — คิด n_bet ใหม่ที่นี่ไม่ได้ (ต้องตัดเดือนก่อน) */
export function hasMonthSplit(leg: PortfolioLegConfig): boolean {
  return leg.train_months !== undefined || leg.test_months !== undefined;
}

/** ต้นทุนต่องวด — ขารายเดือนคิดจากเดือนที่แทงเยอะสุด (worst case เหมือนฝั่ง Python) */
export function legCost(leg: PortfolioLegConfig): number {
  return leg.n_bet * leg.bet_per_number;
}

/** บรรทัดสรุปโหมดของขา — แบบเดียวกับลิสต์ "ขาทั้งหมดในพอร์ต" ฝั่ง Streamlit */
export function legModeText(leg: PortfolioLegConfig): string {
  if (leg.mode === "manual") {
    const months = bettingMonths(leg);
    if (isMonthly(leg)) {
      const detail = months.map((m) => `${monthName(m)} ${leg.manual_months?.[String(m)]?.length ?? 0}`).join(" · ");
      return months.length > 0 ? `กำหนดเอง รายเดือน · ${detail}` : "กำหนดเอง รายเดือน · ยังไม่ได้ใส่เลขสักเดือน";
    }
    return `กำหนดเอง ${leg.manual_nums.length} ตัว`;
  }
  const formula = leg.formula_name ?? "—";
  if (leg.mode === "rank") return `${formula} · อันดับ ${leg.rank ?? 1}`;
  if (leg.mode === "auto") return `${formula} · จุดดีสุดอัตโนมัติ`;
  return `${formula} · ล็อกไว้ ${leg.n_bet} ตัว`;
}

/* ─────────────────────────── เขียนค่ากลับเข้าตัวขา ─────────────────────────── */

/**
 * ตั้งชุดเลขแบบ "ทั้งปี" — `n_bet` ต้องเท่ากับจำนวนเลขเสมอ ไม่งั้นต้นทุนที่โชว์
 * กับเลขที่แทงจริงจะคนละเรื่องกัน
 */
export function setYearNumbers(leg: PortfolioLegConfig, numbers: string[]): PortfolioLegConfig {
  const next = { ...leg, manual_nums: numbers, n_bet: numbers.length };
  delete next.manual_months;
  return next;
}

/**
 * ตั้งชุดเลขแบบ "แยกรายเดือน"
 *
 * - เก็บเฉพาะเดือนที่มีเลขจริง (เดือนที่ไม่มีคีย์ = ไม่แทงเดือนนั้น)
 * - `manual_nums` = เลขรวมทุกเดือน (ไว้โชว์/สำรอง — ฝั่ง Python ก็เก็บแบบนี้)
 * - `n_bet` = เดือนที่แทงเยอะสุด = **worst case ของต้นทุน** ไม่ใช่ค่าเฉลี่ย
 */
export function setMonthlyNumbers(
  leg: PortfolioLegConfig,
  months: Record<string, string[]>,
): PortfolioLegConfig {
  const kept: Record<string, string[]> = {};
  const union: string[] = [];
  const seen = new Set<string>();
  let widest = 0;

  for (const month of ALL_MONTHS) {
    const numbers = months[String(month)] ?? [];
    if (numbers.length === 0) continue;
    kept[String(month)] = numbers;
    widest = Math.max(widest, numbers.length);
    for (const number of numbers) {
      if (seen.has(number)) continue;
      seen.add(number);
      union.push(number);
    }
  }

  return { ...leg, manual_months: kept, manual_nums: union, n_bet: widest };
}

/**
 * เรตจ่ายที่ตั้งไว้ "ผิดชั้น" หรือเปล่า — คืนข้อความเตือน หรือ null ถ้าดูปกติ
 *
 * เรตของเลข 2 หลักอยู่แถว ๆ 90-100 · 3 หลักแถว ๆ 900-1000 ⇒ ห่างกันสิบเท่า
 * ตั้งสลับชั้นกันแล้ว **ไม่มี error อะไรเลย** มีแต่กำไรที่พองหรือแฟบไปสิบเท่า
 * ⇒ ต้องเตือนบนจอ ไม่ใช่รอให้คนสังเกตเอาเองว่าตัวเลขดูดีเกินจริง
 */
export function payoutWarning(leg: PortfolioLegConfig): string | null {
  const digits = legDigits(leg);
  const rate = leg.payout_rate;
  if (digits === 2 && rate >= 200) {
    return `เรตจ่าย ${rate} เป็นเรตของเลข 3 หลัก — ขานี้เป็น 2 หลัก ปกติอยู่แถว 90-100`;
  }
  if (digits === 3 && rate < 200) {
    return `เรตจ่าย ${rate} เป็นเรตของเลข 2 หลัก — ขานี้เป็น 3 หลัก ปกติอยู่แถว 900-1000`;
  }
  return null;
}

/** ป้ายที่โชว์ของขา — รูปแบบเดียวกับที่ฝั่ง Python ตั้งไว้ */
export function legLabel(flag: string, lottery: string, position: string): string {
  return `${flag} ${lottery} · ${position}`;
}

/** เดา "1 งวด = กี่ตัวอักษร" จากชื่อตำแหน่ง — ตารางผลหวยยังไม่ได้ส่งคอลัมน์ digits มาให้ */
export function digitsOfPosition(position: string): 2 | 3 {
  return position.includes("สาม") ? 3 : 2;
}

/**
 * JSON ที่เรียงคีย์เสมอ — ใช้เทียบว่า "แก้อะไรไปหรือยัง"
 *
 * `JSON.stringify` ธรรมดาเทียบไม่ได้ เพราะการแก้ขาสร้างอ็อบเจกต์ใหม่ทุกครั้ง
 * (เช่นลบคีย์ `manual_months` แล้วใส่กลับ) ลำดับคีย์เลยสลับ ⇒ จะขึ้นว่า "ยังไม่บันทึก"
 * ทั้งที่เนื้อในเหมือนเดิมเป๊ะ แล้วปุ่มบันทึกจะค้างอยู่ตลอดจนคนเลิกเชื่อมัน
 */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return item;
    const source = item as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = source[key];
    return sorted;
  });
}

/* ─────────────────────────── สร้างของใหม่ (ขา / พอร์ต) ─────────────────────────── */

/** กลุ่มผลหวยที่เลือกได้ตอนเพิ่มขา — รูปเดียวกับที่ `/api/lottery/datasets` ส่งมา */
export interface DatasetGroup {
  lottery: string;
  position: string;
  flag: string;
  digits: number;
  years: string[];
}

/**
 * ขาใหม่ = โหมด **กำหนดเลขเอง** เสมอ
 *
 * ทำไมไม่ให้เลือกสูตรตั้งแต่แรก: ขาโหมดสูตรต้องมีปีเทรน + อันดับ + ต้องรัน `runAllSizes`
 * ถึงจะรู้ `n_bet` ⇒ ตั้งค่าผิดแล้วพอร์ตจะคำนวณไม่ออกโดยไม่รู้ว่าพลาดตรงไหน
 * ขากำหนดเลขเองเห็นผลทันทีจากเลขที่พิมพ์ · ขาโหมดสูตรยังตั้งได้ที่แอปเดิม
 *
 * เรตจ่าย/เงินแทงลอกจากขาที่มีอยู่ (พอร์ตหนึ่งมักแทงเท่ากันทุกขา) — ไม่มีขาเลย
 * ก็ใช้ค่ามาตรฐานของจำนวนหลักนั้น (2 ตัวจ่าย 100 · 3 ตัวจ่าย 1000)
 *
 * ⚠️⚠️ **ต้องลอกจากขาที่หลักเท่ากันเท่านั้น** — เรตจ่ายของ 2 หลัก (~100) กับ 3 หลัก
 * (~1000) ต่างกันสิบเท่า · เคยลอกจาก "ขาสุดท้ายในพอร์ต" เฉย ๆ แล้วขา 2 หลักที่เพิ่ม
 * ต่อจากขาสามบนได้เรต 1000 ติดมา ⇒ ถูกทีเดียวได้เงินสิบเท่าของจริง กำไรทั้งพอร์ต
 * พองขึ้นเป็นล้านโดยไม่มี error อะไรเลย (เจอจริง ก.ย. 2569 ตอนเพิ่มขาหุ้นฮั่งเส็ง)
 */
export function newManualLeg(
  group: DatasetGroup,
  testYear: string,
  existing?: readonly PortfolioLegConfig[] | PortfolioLegConfig,
): PortfolioLegConfig {
  const digits = group.digits === 3 ? 3 : 2;
  const pool = Array.isArray(existing)
    ? (existing as readonly PortfolioLegConfig[])
    : existing
      ? [existing as PortfolioLegConfig]
      : [];
  // ขาหลังสุดที่หลักเท่ากัน — หลักไม่เท่ากันคือคนละเรตคนละเงินแทง ห้ามลอกข้ามกัน
  const like = [...pool].reverse().find((leg) => legDigits(leg) === digits);
  return {
    group_label: legLabel(group.flag || "🎰", group.lottery, group.position),
    lottery: group.lottery,
    position: group.position,
    flag: group.flag || "🎰",
    digits,
    // ขากำหนดเลขเองไม่ต้องเทรน — ปีเทรนมีไว้ให้สูตรนับความถี่เท่านั้น
    train_years: [],
    test_year: testYear,
    mode: "manual",
    formula_name: null,
    rank: 1,
    n_bet: 0,
    manual_nums: [],
    bet_per_number: like?.bet_per_number ?? 100,
    payout_rate: like?.payout_rate ?? (digits === 3 ? 1000 : 100),
  };
}

/** พอร์ตเปล่าที่ยังไม่ได้บันทึก — `id` เป็น null จนกว่าฝั่ง API จะตั้งเลขให้ */
export function newPortfolioDraft(name: string): {
  id: null;
  name: string;
  source: string | null;
  capital: number;
  config: PortfolioConfig;
} {
  return {
    id: null,
    name,
    source: "สร้างในแอปบัญชี",
    capital: 0,
    // ยังไม่ติ๊ก "ใช้จริง" — พอร์ตใหม่ที่ยังไม่มีขาไม่ควรไปแทนที่พอร์ตที่รายงานอยู่
    config: { legs: [], is_active: false },
  };
}
