/**
 * รับ snapshot ของพอร์ตจากแอป Streamlit (lottery-app) แล้วแปลงเป็นรูปที่หน้าเว็บใช้
 *
 * ฝั่งโน้นส่งมาเป็น snake_case (Python) — ที่นี่ตรวจด้วย zod แล้วแปลงเป็น camelCase
 * **ครั้งเดียวตอนรับ** แล้วเก็บรูปที่แปลงแล้วลง DB ⇒ หน้าเว็บอ่านได้ตรง ๆ
 * และข้อมูลผิดรูปถูกปฏิเสธตั้งแต่ประตู ไม่ไปโผล่เป็นกราฟเพี้ยนทีหลัง
 *
 * ⚠️ ตัวเลขทุกตัวคำนวณมาแล้วฝั่ง Python — ที่นี่ห้ามคำนวณใหม่ ไม่งั้นเลขในสองแอป
 *    จะไม่ตรงกันโดยไม่มีใครรู้ (ที่มา: src/portfolio_snapshot.py ของ lottery-app)
 */

import { z } from "zod";
import type { PortfolioSnapshot } from "./types";

/** เวอร์ชันรูปแบบสูงสุดที่แอปนี้เข้าใจ — สูงกว่านี้ = ฝั่งโน้นอัปแล้วที่นี่ยังไม่อัป */
export const SUPPORTED_SNAPSHOT_VERSION = 1;

const intArray = z.array(z.number()).max(2000);

const legSchema = z.object({
  index: z.number().int(),
  name: z.string().max(200),
  formula: z.string().max(200).default(""),
  digits: z.number().int().default(2),
  n_bet: z.number().int(),
  bet_per_number: z.number().default(0),
  payout_rate: z.number().default(0),
  profit: z.number(),
  max_real_loss: z.number().default(0),
  worst_month_dd: z.number().default(0),
  loss_streak: z.number().default(0),
  loss_streak_amount: z.number().default(0),
  wins: z.number().default(0),
  draws: z.number().default(0),
  win_rate: z.number().default(0),
  curve: intArray,
  numbers: z.array(z.string().max(4)).max(1000).default([]),
  month_sets: z.record(z.string(), z.array(z.string().max(4))).default({}),
});

const kpiSchema = z.object({
  capital: z.number(),
  profit: z.number(),
  roi_pct: z.number(),
  max_drawdown: z.number(),
  sharpe: z.number(),
  // ∞ ฝั่ง Python (ไม่เคยขาดทุน) → null เพราะ JSON ไม่มี Infinity
  profit_factor: z.number().nullable(),
  max_win_streak: z.number(),
  max_loss_streak: z.number(),
  max_loss_streak_amount: z.number(),
  worst_loss_run_len: z.number(),
  worst_loss_run_amount: z.number(),
  reserve_needed: z.number(),
  worst_month_dd: z.number(),
  worst_month_label: z.string().max(40).default(""),
  wins: z.number(),
  draws: z.number(),
  win_rate: z.number(),
});

export const snapshotPayloadSchema = z.object({
  version: z.number().int().min(1),
  generated_at: z.string().max(60),
  portfolio: z.object({
    id: z.number().int(),
    name: z.string().min(1).max(200),
    source: z.string().max(40).default(""),
    capital: z.number(),
    n_legs: z.number().int(),
    test_years: z.array(z.string().max(4)).max(20).default([]),
    year: z.string().max(4).default(""),
    as_of: z.string().max(200).default(""),
    is_active: z.boolean().default(false),
  }),
  kpi: kpiSchema,
  equity: z.object({
    capital: z.number(),
    values: intArray,
    // [ชื่อเดือน, index ของวันปฏิทินที่เดือนนั้นเริ่ม]
    month_divs: z.array(z.tuple([z.string().max(20), z.number().int()])).max(24).default([]),
  }),
  monthly: z
    .array(
      z.object({
        label: z.string().max(20),
        capital_start: z.number(),
        profit: z.number(),
        max_dd: z.number(),
        idx_start: z.number().int(),
        idx_end: z.number().int(),
      }),
    )
    .max(24)
    .default([]),
  legs: z.array(legSchema).max(50),
});

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;

/** payload ที่เก็บลง DB = ทุกอย่างยกเว้นคอลัมน์ที่แยกออกไป (id/name/isActive/version/…) */
export type StoredSnapshot = Omit<
  PortfolioSnapshot,
  "portfolioId" | "name" | "isActive" | "version" | "generatedAt" | "receivedAt"
>;

export function toStored(payload: SnapshotPayload): StoredSnapshot {
  const p = payload.portfolio;
  const k = payload.kpi;
  return {
    capital: p.capital,
    nLegs: p.n_legs,
    testYears: p.test_years,
    asOf: p.as_of,
    kpi: {
      capital: k.capital,
      profit: k.profit,
      roiPct: k.roi_pct,
      maxDrawdown: k.max_drawdown,
      sharpe: k.sharpe,
      profitFactor: k.profit_factor,
      maxWinStreak: k.max_win_streak,
      maxLossStreak: k.max_loss_streak,
      maxLossStreakAmount: k.max_loss_streak_amount,
      worstLossRunLen: k.worst_loss_run_len,
      worstLossRunAmount: k.worst_loss_run_amount,
      reserveNeeded: k.reserve_needed,
      worstMonthDd: k.worst_month_dd,
      worstMonthLabel: k.worst_month_label,
      wins: k.wins,
      draws: k.draws,
      winRate: k.win_rate,
    },
    equity: {
      capital: payload.equity.capital,
      values: payload.equity.values,
      monthDivs: payload.equity.month_divs,
    },
    monthly: payload.monthly.map((m) => ({
      label: m.label,
      capitalStart: m.capital_start,
      profit: m.profit,
      maxDd: m.max_dd,
      idxStart: m.idx_start,
      idxEnd: m.idx_end,
    })),
    legs: payload.legs.map((leg) => ({
      index: leg.index,
      name: leg.name,
      formula: leg.formula,
      digits: leg.digits,
      nBet: leg.n_bet,
      betPerNumber: leg.bet_per_number,
      payoutRate: leg.payout_rate,
      profit: leg.profit,
      maxRealLoss: leg.max_real_loss,
      worstMonthDd: leg.worst_month_dd,
      lossStreak: leg.loss_streak,
      lossStreakAmount: leg.loss_streak_amount,
      wins: leg.wins,
      draws: leg.draws,
      winRate: leg.win_rate,
      curve: leg.curve,
      numbers: leg.numbers,
      monthSets: leg.month_sets,
    })),
  };
}

interface SnapshotRow {
  portfolio_id: number;
  name: string;
  is_active: boolean;
  version: number;
  generated_at: string;
  received_at: string;
  payload: StoredSnapshot;
}

export function fromRow(row: SnapshotRow): PortfolioSnapshot {
  return {
    portfolioId: row.portfolio_id,
    name: row.name,
    isActive: row.is_active,
    version: row.version,
    generatedAt: row.generated_at,
    receivedAt: row.received_at,
    ...row.payload,
  };
}
