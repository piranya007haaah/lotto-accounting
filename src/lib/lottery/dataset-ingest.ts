/**
 * รูปแบบข้อมูลผลหวยที่รับจากแอป Streamlit (`scripts/sync_to_supabase.py`)
 *
 * แยกออกจาก route เพื่อให้ตรวจได้โดยไม่ต้องยิง HTTP จริง
 * (`npx tsx scripts/lottery-ingest-check.ts`)
 */

import { z } from "zod";

export const entrySchema = z.object({
  lottery: z.string().min(1).max(200),
  position: z.string().min(1).max(40),
  year: z.string().min(1).max(4),
  flag: z.string().max(16).default("🎰"),
  // ผลทั้งปี — 2 ตัวอักษร/วัน (สูงสุด 366 วัน = 732 ตัวอักษร · 3 ตัวก็ยังไม่เกิน 1,098)
  sequence: z.string().max(2000).default(""),
  isDateSorted: z.boolean().default(false),
  /** 1 งวด = กี่ตัวอักษร — ไม่ส่งมา = 2 (ของเดิมก่อนมีขา 3 ตัว) */
  digits: z.union([z.literal(2), z.literal(3)]).default(2),
});

export const payloadSchema = z.object({
  entries: z.array(entrySchema).max(3000),
  payouts: z
    .array(z.object({ lottery: z.string().min(1).max(200), payout: z.number().int().min(1) }))
    .max(1000)
    .default([]),
});

export type DatasetEntry = z.infer<typeof entrySchema>;
export type DatasetPayload = z.infer<typeof payloadSchema>;
