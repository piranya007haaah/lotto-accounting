/**
 * "ดูช่วงไหน" ของหน้าพอร์ต — ทั้งปี หรือเจาะเดือนเดียว
 *
 * หน้าพอร์ตเดิมโชว์ยอด **ทั้งปี** อย่างเดียว ซึ่งตอบคำถาม "ปีนี้ได้เท่าไหร่" แต่คำถาม
 * ที่ถามทุกวันคือ "เดือนนี้เป็นยังไง" (การ์ด LINE ตอบให้อยู่แล้ว หน้าเว็บควรตอบด้วย)
 *
 * ⚠️⚠️ **ไม่คำนวณ pnl ใหม่เลย** — ตัดช่วงจากเส้นทุน/เส้นกำไรรายขาที่ engine คิดมาแล้ว
 * แล้ววัดความเสี่ยงด้วย `computeRiskMetrics` ตัวเดียวกับที่ `computeSnapshot` ใช้
 * ⇒ ยอดรวมของทุกเดือนบวกกันแล้วเท่ากับยอดทั้งปีเสมอ ไม่มีทางเพี้ยนคนละทาง
 *
 * ⚠️⚠️ **index ของเส้นทุนเลื่อนไป 1 จาก index ของผลหวย**: `curve[i]` = ทุนหลังจบวันที่
 * `i − 1` (curve[0] = ทุนก่อนเริ่ม) ⇒ ช่วงเส้นทุน `[a, b]` = ผลหวยวันที่ `a … b−1`
 * เผลอส่ง `[a, b]` ตรง ๆ ให้ตัวนับงวด จะนับวันแรกของเดือนถัดไปเข้ามาด้วยเงียบ ๆ
 */

import { computeRiskMetrics } from "./engine";
import {
  drawdownInSpan,
  legWinRateIn,
  thaiDateOf,
  yearBeToCe,
  type ReplayResult,
} from "./portfolio-engine";
import type { PortfolioLeg, PortfolioSnapshot } from "@/lib/types";

/** ป้ายเดือนของ snapshot เป็นอังกฤษเสมอ (ตรงกับ `date.strftime("%b")` ของ Python) */
const EN_ORDER = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TH_ABBR = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export interface SnapshotWindow {
  /** `"all"` = ทั้งปี · นอกนั้นเป็นป้ายเดือนของ snapshot ("Sep") */
  key: string;
  /** ป้ายบนชิป — ภาษาไทย */
  label: string;
  /** เลขเดือน 1-12 · `null` = ทั้งปี */
  month: number | null;
  /** index ของ **เส้นทุน** (ไม่ใช่ของผลหวย — ดูหมายเหตุหัวไฟล์) */
  idxStart: number;
  idxEnd: number;
}

/** ทั้งปี + ทุกเดือนที่พอร์ตมีข้อมูลจริง (เดือนที่ยังไม่ถึงไม่มีชิป) */
export function snapshotWindows(snapshot: PortfolioSnapshot): SnapshotWindow[] {
  const last = Math.max(0, snapshot.equity.values.length - 1);
  const all: SnapshotWindow = { key: "all", label: "ทั้งปี", month: null, idxStart: 0, idxEnd: last };
  return [
    all,
    ...snapshot.monthly.map((month) => {
      const i = EN_ORDER.indexOf(month.label);
      return {
        key: month.label,
        label: i >= 0 ? TH_ABBR[i] : month.label,
        month: i >= 0 ? i + 1 : null,
        idxStart: month.idxStart,
        idxEnd: month.idxEnd,
      };
    }),
  ];
}

/** ปี ค.ศ. ของ snapshot (ปีที่ทดสอบล่าสุด) — ไว้แปลง index เป็นวันที่ */
function ceYearOf(snapshot: PortfolioSnapshot): number | null {
  const year = snapshot.testYears[snapshot.testYears.length - 1];
  if (!year) return null;
  try {
    return yearBeToCe(year);
  } catch {
    return null;
  }
}

/**
 * วันที่ร่วงหนักที่สุด **วันเดียว** ในช่วง — คนละเรื่องกับ Max DD (ซึ่งเป็นการร่วงสะสม)
 * ในโหมดรายเดือน "เดือนที่ร่วงหนักสุด" ไม่มีความหมาย (มีเดือนเดียว) จึงเอาช่องนั้นมาบอกอันนี้แทน
 */
export function worstDayIn(
  snapshot: PortfolioSnapshot,
  win: SnapshotWindow,
): { amount: number; label: string } | null {
  const values = snapshot.equity.values;
  if (values.length < 2) return null;
  let worst = 0;
  let at = -1;
  for (let i = Math.max(1, win.idxStart + 1); i <= Math.min(win.idxEnd, values.length - 1); i += 1) {
    const diff = values[i] - values[i - 1];
    if (diff < worst) {
      worst = diff;
      at = i;
    }
  }
  if (at < 0) return null;
  const ce = ceYearOf(snapshot);
  // curve[i] = ทุนหลังจบวันที่ i−1 ⇒ วันที่ของการร่วงคือวันปฏิทินที่ i−1
  const label = ce === null ? "" : thaiDateOf(new Date(Date.UTC(ce, 0, at)));
  return { amount: Math.trunc(worst), label };
}

/**
 * ตัด snapshot ให้เหลือช่วงเดียว — คืน `PortfolioSnapshot` **รูปเดิมเป๊ะ** เพื่อให้
 * หน้าจอเดิมวาดต่อได้โดยไม่ต้องรู้ว่ากำลังดูเดือนหรือทั้งปี
 *
 * `replay` ส่งมาแล้วจะได้ **ถูกกี่งวด/แทงกี่งวดของเดือนนั้น** ด้วย (นับด้วย `legWinRateIn`
 * ของ engine ตัวเดียวกับที่ snapshot ทั้งปีใช้) · ไม่ส่ง (snapshot เก่าจาก Python ที่
 * ไม่มีข้อมูลดิบให้นับ) = อัตราถูกเป็น 0/0 แล้วหน้าจอไม่โชว์ — ดีกว่าเดาตัวเลขให้
 */
export function sliceSnapshot(
  snapshot: PortfolioSnapshot,
  win: SnapshotWindow,
  replay?: ReplayResult,
): PortfolioSnapshot {
  if (win.month == null) return snapshot;

  const { idxStart, idxEnd } = win;
  const values = snapshot.equity.values.slice(idxStart, idxEnd + 1);
  if (values.length < 2) return snapshot;

  const capital = values[0];
  const profit = values[values.length - 1] - capital;
  const risk = computeRiskMetrics(values);
  // "Max DD" ของทั้งปีวัดจาก **ทุนตั้งต้น** ⇒ ของเดือนก็วัดจาก **ทุนต้นเดือน** (เลขบวก)
  const maxDd = Math.max(0, capital - Math.min(...values));
  const worstLossRunAmount = Math.trunc(risk.worstLossRunAmount);

  const legs: PortfolioLeg[] = snapshot.legs.map((leg) => {
    const slice = leg.curve.slice(idxStart, idxEnd + 1);
    const base = slice[0] ?? 0;
    // เส้นของขาเป็น "กำไรสะสมอ้างอิงที่ 0" ⇒ ของเดือนต้องเริ่มที่ 0 ใหม่เหมือนกัน
    const curve = slice.map((value) => value - base);
    const legRisk = computeRiskMetrics(slice);
    // ⚠️ ช่วงเส้นทุน [a, b] = ผลหวยวันที่ a … b−1 (index เลื่อนกัน 1)
    const detail = replay?.details[leg.index - 1];
    const counts = detail ? legWinRateIn(detail, idxStart, idxEnd - 1) : { wins: 0, draws: 0 };
    return {
      ...leg,
      profit: Math.trunc(curve[curve.length - 1] ?? 0),
      curve,
      maxRealLoss: Math.trunc(Math.min(0, ...curve)),
      worstMonthDd: drawdownInSpan(leg.curve, idxStart, idxEnd),
      lossStreak: legRisk.maxLossStreak,
      lossStreakAmount: Math.trunc(legRisk.maxLossStreakAmount),
      wins: counts.wins,
      draws: counts.draws,
      winRate: counts.draws > 0 ? (counts.wins / counts.draws) * 100 : 0,
    };
  });

  const wins = legs.reduce((sum, leg) => sum + leg.wins, 0);
  const draws = legs.reduce((sum, leg) => sum + leg.draws, 0);
  const month = snapshot.monthly.find((row) => row.label === win.key);

  return {
    ...snapshot,
    capital,
    kpi: {
      ...snapshot.kpi,
      capital,
      profit: Math.trunc(profit),
      roiPct: capital ? (profit / capital) * 100 : 0,
      maxDrawdown: Math.trunc(maxDd),
      sharpe: risk.sharpe,
      profitFactor: risk.profitFactor,
      maxWinStreak: risk.maxWinStreak,
      maxLossStreak: risk.maxLossStreak,
      maxLossStreakAmount: Math.trunc(risk.maxLossStreakAmount),
      worstLossRunLen: risk.worstLossRunLen,
      worstLossRunAmount,
      reserveNeeded: Math.max(Math.trunc(maxDd), Math.abs(worstLossRunAmount)),
      worstMonthDd: month?.maxDd ?? 0,
      worstMonthLabel: win.key,
      wins,
      draws,
      winRate: draws > 0 ? (wins / draws) * 100 : 0,
    },
    equity: {
      capital,
      values,
      // เดือนเดียว = ไม่มีเส้นคั่นข้างใน (เส้นคั่นคือ "ต้นเดือนถัดไป")
      monthDivs: [],
    },
    monthly: [
      {
        label: win.key,
        capitalStart: capital,
        profit: Math.trunc(profit),
        maxDd: month?.maxDd ?? 0,
        idxStart: 0,
        idxEnd: values.length - 1,
      },
    ],
    legs,
  };
}
