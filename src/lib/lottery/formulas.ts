/**
 * สูตรเลือกเลข 2 ตัว — พอร์ตมาจาก `src/formulas.py` ของรีโป lottery-app
 *
 * ⚠️⚠️ ห้ามแก้พฤติกรรมของสูตรที่นี่ฝ่ายเดียว — ตราบใดที่แอป Streamlit ยังมีอยู่
 * สองฝั่งต้องให้ลำดับเลขเหมือนกันเป๊ะ ไม่งั้นคนเห็นคนละคำตอบจากสูตรชื่อเดียวกัน
 * มีเทสต์เทียบกับผลจริงของ Python: `npx tsx scripts/formula-check.ts`
 *
 * สูตร = f(train_str) → รายชื่อเลข 100 ตัว เรียงจาก "ควรแทงที่สุด" → "น้อยสุด"
 * engine หยิบ n ตัวแรกไปแทงทุกงวดของปี test (pool คงที่)
 */

/** เลขทั้งหมด "00".."99" — ลำดับนี้คือ tie-break ของทุกสูตร */
const ALL_NUMBERS: readonly string[] = Array.from({ length: 100 }, (_, i) =>
  String(i).padStart(2, "0"),
);

/**
 * ตัด sequence เป็นคู่ ๆ แล้วเก็บเฉพาะคู่ที่เป็นตัวเลขจริง
 * (วันหยุด/ยังไม่ออกผลเก็บเป็น `xx` หรือ `--` → ข้ามไป เหมือนฝั่ง Python)
 */
export function dailyPairs(sequence: string): string[] {
  const s = (sequence ?? "").toLowerCase();
  const out: string[] = [];
  for (let i = 0; i + 2 <= s.length; i += 2) {
    const pair = s.slice(i, i + 2);
    if (pair.charCodeAt(0) >= 48 && pair.charCodeAt(0) <= 57 &&
        pair.charCodeAt(1) >= 48 && pair.charCodeAt(1) <= 57) {
      out.push(pair);
    }
  }
  return out;
}

function countBy(values: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return counts;
}

/** เรียงตามคะแนนมาก→น้อย · คะแนนเท่ากันเรียงตามเลขน้อย→มาก (กติกาเดียวกับ Python) */
function sortByScoreDesc(score: (num: string) => number): string[] {
  return [...ALL_NUMBERS].sort((a, b) => {
    const diff = score(b) - score(a);
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });
}

/** เรียงจากเลขที่ออกบ่อยสุด → น้อยสุด */
export function mostFrequent(trainString: string): string[] {
  const freq = countBy(dailyPairs(trainString));
  return sortByScoreDesc((num) => freq.get(num) ?? 0);
}

/** เรียงจากเลขที่ออกน้อยสุด → มากสุด (สวนกระแส) */
export function leastFrequent(trainString: string): string[] {
  const freq = countBy(dailyPairs(trainString));
  return [...ALL_NUMBERS].sort((a, b) => {
    const diff = (freq.get(a) ?? 0) - (freq.get(b) ?? 0);
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });
}

/** เลขเบิ้ล (00, 11, …, 99) ขึ้นก่อน แล้วเรียงตามความถี่ */
export function doubleDigits(trainString: string): string[] {
  const freq = countBy(dailyPairs(trainString));
  return [...ALL_NUMBERS].sort((a, b) => {
    const doubleA = a[0] === a[1] ? 0 : 1;
    const doubleB = b[0] === b[1] ? 0 : 1;
    if (doubleA !== doubleB) return doubleA - doubleB;
    const diff = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });
}

/**
 * ความถี่คู่เลข + โครงหลักเลข (Bayesian shrinkage)
 *
 * คะแนน = ครั้งที่คู่เลขออกจริง + ครั้งที่ "คาดหวัง" จากความถี่หลักสิบ×หลักหน่วย (t·u/N)
 * = ดึงความถี่ดิบเข้าหาโครงสร้างรายหลัก ลด noise ของคู่ที่ออกบ่อยเพราะฟลุก
 * (สูตรที่ backtest แล้วดีที่สุด — ดู docs/สูตรความถี่ผสมหลักเลข.md ของ lottery-app)
 */
export function freqDigitBlend(trainString: string): string[] {
  const pairs = dailyPairs(trainString);
  const n = pairs.length;
  if (n === 0) return [...ALL_NUMBERS];

  const freq = countBy(pairs);
  const tens = countBy(pairs.map((p) => p[0]));
  const units = countBy(pairs.map((p) => p[1]));

  return sortByScoreDesc(
    (num) =>
      (freq.get(num) ?? 0) + ((tens.get(num[0]) ?? 0) * (units.get(num[1]) ?? 0)) / n,
  );
}

/** Rolling Range ±n รอบเลขล่าสุดของ train (ระยะใกล้ก่อน) แล้วต่อด้วยที่เหลือตามความถี่ */
export function rollingRange(trainString: string, n = 30): string[] {
  const pairs = dailyPairs(trainString);
  const freq = countBy(pairs);
  if (pairs.length === 0) return [...ALL_NUMBERS];

  const last = Number(pairs[pairs.length - 1]);
  const rolling: string[] = [];
  const seen = new Set<string>();
  for (let i = 1; i <= n; i += 1) {
    for (const sign of [-1, 1]) {
      // ⚠️ % ของ JS ให้ค่าติดลบได้ (ต่างจาก Python) — ต้องบวก 100 ก่อนเสมอ
      const value = (((last + sign * i) % 100) + 100) % 100;
      const label = String(value).padStart(2, "0");
      if (!seen.has(label)) {
        seen.add(label);
        rolling.push(label);
      }
    }
  }

  const remaining = ALL_NUMBERS.filter((num) => !seen.has(num)).sort((a, b) => {
    const diff = (freq.get(b) ?? 0) - (freq.get(a) ?? 0);
    return diff !== 0 ? diff : a < b ? -1 : a > b ? 1 : 0;
  });
  return [...rolling, ...remaining];
}

/** ชื่อสูตรต้องตรงกับฝั่ง Python เป๊ะ — ใช้เป็นคีย์ที่เก็บลง config/พอร์ต */
export const FORMULAS: Record<string, (trainString: string) => string[]> = {
  "ความถี่สูงสุด": mostFrequent,
  "ความถี่ผสมหลักเลข": freqDigitBlend,
  "ความถี่ต่ำสุด": leastFrequent,
  "เน้นเลขเบิ้ล": doubleDigits,
  "Rolling Range ±30": (s) => rollingRange(s, 30),
};

export const FORMULA_NAMES = Object.keys(FORMULAS);

/** สูตรที่ backtest แล้วดีสุด — ใช้เป็นค่าเริ่มต้นของหน้าจอ */
export const DEFAULT_FORMULA = "ความถี่ผสมหลักเลข";
