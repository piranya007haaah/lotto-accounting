/**
 * รูปแบบ "ตั้งค่าพอร์ต" — ก้อนเดียวกับ `config_json` ของตาราง portfolios ฝั่ง lottery-app
 *
 * ⚠️⚠️ **คงชื่อคีย์เป็น snake_case ตามฝั่ง Python ทั้งดุ้น** (ต่างจาก portfolio-snapshot.ts
 * ที่แปลงเป็น camelCase ตอนรับ) เพราะก้อนนี้ต้องวิ่งกลับไปฝั่งโน้นได้ด้วย — รายงาน LINE
 * และแอป Streamlit ยังอ่าน config ตัวนี้อยู่ · แปลงชื่อคีย์ = ต้องแปลงกลับทุกครั้ง
 * แล้วสักวันจะแปลงตกจนพอร์ตเพี้ยนเงียบ ๆ
 *
 * `.passthrough()` ตั้งใจ: ฝั่งโน้นเพิ่มคีย์ใหม่ในขาได้เรื่อย ๆ (manual_months / train_months
 * มาทีหลังทั้งคู่) — ไม่รู้จักก็ **เก็บไว้เฉย ๆ** ดีกว่าลบทิ้งตอนบันทึก
 */

import { z } from "zod";

/** โหมดของขา — ตรงกับฝั่ง Python (`replay_portfolio`) */
export const LEG_MODES = ["manual", "rank", "auto", "fixed_n"] as const;

/**
 * ⚠️ **ฝั่ง Python เขียน `null` แทน "ไม่ได้ตั้งค่า"** (json.dumps ของ `None`) —
 * `.optional()` / `.default()` ของ zod รับแต่ `undefined` ⇒ ปะทะกันแล้ว **ทั้งพอร์ตถูกปฏิเสธ**
 * (วัดจริง: พอร์ตจริง 8 ตัวตกไป 4 เพราะ `train_months: null` / `test_months: null`)
 * ตัวนี้แปลง null → undefined ก่อน แล้วค่อยให้ schema จัดการตามปกติ
 */
const nullable = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === null ? undefined : value), schema);

export const legSchema = z
  .object({
    /** ป้ายที่โชว์ เช่น "🇻🇳 หวยฮานอยพิเศษ · สามบน" */
    group_label: z.string().max(200),
    lottery: z.string().min(1).max(200),
    position: z.string().min(1).max(40),
    flag: nullable(z.string().max(16).default("🎰")),
    /** 2 = สองบน/สองล่าง · 3 = สามบน (ไม่ส่งมา = 2 ตามพอร์ตเก่า) */
    digits: nullable(z.union([z.literal(2), z.literal(3)]).default(2)),
    /** ปีที่ใช้เทรน — ขา manual ว่างได้ (ไม่ได้ใช้สูตร) */
    train_years: nullable(z.array(z.string().max(4)).default([])),
    test_year: z.string().min(1).max(4),
    mode: z.enum(LEG_MODES),
    formula_name: z.string().max(120).nullable().default(null),
    /** อันดับที่เลือกจาก train (โหมด rank/auto) */
    rank: z.number().int().min(1).max(1000).nullable().default(1),
    n_bet: z.number().int().min(0).max(1000),
    manual_nums: nullable(z.array(z.string().max(3)).max(1000).default([])),
    /** {"1": ["45","07"], ...} — เดือนที่ไม่มีคีย์ = **ไม่แทงเดือนนั้น** ไม่ใช่ใช้เลขทั้งปี */
    manual_months: nullable(z.record(z.string(), z.array(z.string().max(3)).max(1000)).optional()),
    /** {"68": [1,2,3]} = ใช้เฉพาะเดือนพวกนี้ของปีนั้นเป็น train */
    train_months: nullable(z.record(z.string(), z.array(z.number().int().min(1).max(12))).optional()),
    test_months: nullable(z.array(z.number().int().min(1).max(12)).optional()),
    bet_per_number: z.number().min(0).max(1_000_000),
    payout_rate: z.number().min(1).max(10_000),
  })
  .passthrough();

export const scheduleSchema = z
  .object({
    /** {"หวยฮานอยพิเศษ": "17:30"} — เวลาออกผล = ลำดับของหวยในรายงาน */
    lottery_times: z.record(z.string(), z.string().max(10)).optional(),
  })
  .passthrough();

export const portfolioConfigSchema = z
  .object({
    legs: nullable(z.array(legSchema).max(100).default([])),
    is_active: z.boolean().optional(),
    /** `.nullish()` ไม่ใช่ `.optional()` — ฝั่ง Python เขียน `"schedule": null` ได้
     *  (พอร์ตที่ไม่เคยตั้งเวลา) แล้ว `.optional()` จะปฏิเสธทั้งพอร์ตเพราะ null ≠ undefined */
    schedule: scheduleSchema.nullish(),
    /**
     * true = เจ้าของถอนกำไรออกทุกสิ้นเดือน ⇒ ต้นเดือนถัดไปเหลือทุนตั้งต้นเท่าเดิม
     *
     * ⚠️ มีผลกับ **การแสดงผลอย่างเดียว** (เส้นทุน · ทุนต้นเดือน · เงินสำรองที่ควรมี)
     * เงินแทงเป็นบาทคงที่ไม่ได้ผูกกับทุน ⇒ กำไรทุกตัวเลขเท่าเดิม ไม่ว่าจะถอนหรือไม่
     * · ฝั่ง Python ไม่รู้จักคีย์นี้ แต่ `.passthrough()` เก็บไว้ให้ ⇒ ไม่หายตอน sync
     */
    withdraw_monthly: nullable(z.boolean().optional()),
  })
  .passthrough();

export const portfolioSchema = z.object({
  id: z.number().int().min(1),
  name: z.string().min(1).max(200),
  source: z.string().max(200).nullable().default(null),
  capital: z.number().int().min(0).max(1_000_000_000),
  config: portfolioConfigSchema,
});

/** ก้อนที่สคริปต์ฝั่ง Python ส่งมานำเข้าครั้งแรก */
export const portfolioPayloadSchema = z.object({
  portfolios: z.array(portfolioSchema).max(200),
  /** true = ทับของที่มีอยู่แล้ว (ต้องสั่งจากฝั่งโน้นเท่านั้น — ปกติ "มีแล้วข้าม") */
  replace: z.boolean().default(false),
});

/**
 * ก้อนที่หน้าเว็บส่งมาบันทึก **พอร์ตเดียว** (`PUT /api/lottery/portfolios`)
 * ไม่ส่ง `id` = พอร์ตใหม่ → ฝั่ง route ตั้งเลขต่อจาก id ที่มากสุด
 * (id ชุดแรกมาจาก SQLite ฝั่งโน้น จึงใช้ sequence ของ Postgres ไม่ได้ เดี๋ยวชนกัน)
 */
export const portfolioSavePayloadSchema = portfolioSchema.extend({
  id: z.number().int().min(1).optional(),
});

export type PortfolioLegConfig = z.infer<typeof legSchema>;
export type PortfolioConfig = z.infer<typeof portfolioConfigSchema>;
export type LotteryPortfolio = z.infer<typeof portfolioSchema>;

/** true = พอร์ตนี้ติ๊ก "ใช้จริง" (คีย์อยู่ใน config เหมือนฝั่ง Python) */
export function isActiveConfig(config: PortfolioConfig): boolean {
  return Boolean(config.is_active);
}
