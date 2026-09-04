/**
 * "ถ้าเปลี่ยนสูตร/อันดับแล้ว ขานี้จะแทงกี่เลข" — คำนวณให้ดูก่อนกดบันทึก
 *
 * ⚠️⚠️ จัดอันดับ n_bet บน **train เท่านั้น** — `analyzeGroup(mode: "train")` เรียก
 * `runAllSizes` โดยส่ง train เป็น test ซึ่งตรงกับ `rank_n_bet` ฝั่ง Python เป๊ะ
 * ถ้าเผลอไปจัดอันดับบนปี test = รู้ผลแล้วค่อยเลือก (hindsight) ตัวเลขจะสวยขึ้นทันที
 * แบบไม่มีใครสงสัย และ n_bet ที่บันทึกลงพอร์ตก็จะเป็นค่าที่ "เลือกไม่ได้จริง"
 *
 * ⚠️ ทุน/เงินแทงไม่มีผลกับ **อันดับ** (กำไรสเกลเชิงเส้นตามเงินแทงเท่ากันทุก size)
 * มีผลแค่กับตัวเลขกำไรที่โชว์ — จึงส่งค่าของขานั้นเข้าไปตรง ๆ ได้
 */

import { FORMULAS } from "@/lib/lottery/formulas";
import { analyzeGroup } from "@/lib/lottery/rank";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { hasMonthSplit, legDigits } from "./leg-utils";

export interface RankChoicePreview {
  rank: number;
  size: number;
  /** กำไรของ n นี้บน **ปี test** — ดูประกอบได้ แต่ห้ามใช้เลือกอันดับ (นั่นคือ hindsight) */
  testProfit: number;
}

export interface RankPreview {
  choices: RankChoicePreview[];
  /** ไม่ null = คำนวณไม่ได้ ⇒ หน้าจอต้องคง n_bet เดิมไว้ ห้ามเดาตัวเลขใหม่เอง */
  error: string | null;
}

/** คีย์ของ sequence — หวย|ตำแหน่ง|ปี */
export function seqKey(lottery: string, position: string, year: string): string {
  return `${lottery}|${position}|${year}`;
}

export function previewRanks(options: {
  leg: PortfolioLegConfig;
  formula: string;
  capital: number;
  sequences: ReadonlyMap<string, string>;
  topN?: number;
}): RankPreview {
  const { leg, formula, capital, sequences } = options;
  const empty: RankChoicePreview[] = [];

  if (legDigits(leg) !== 2) {
    return { choices: empty, error: "สูตรในแอปนี้ยังมีแต่ของเลข 2 หลัก — ขา 3 ตัวต้องกำหนดเลขเอง" };
  }
  if (hasMonthSplit(leg)) {
    return { choices: empty, error: "ขานี้เจาะจงเดือนของปี train/test — คิดจำนวนเลขใหม่ที่นี่ยังไม่ได้" };
  }
  if (!FORMULAS[formula]) return { choices: empty, error: `ไม่รู้จักสูตร “${formula}”` };

  const trainYears = [...(leg.train_years ?? [])].sort();
  if (trainYears.length === 0) return { choices: empty, error: "ขานี้ไม่มีปี train — เลือกอันดับจากอดีตไม่ได้" };

  const missing: string[] = [];
  const trainStr = trainYears
    .map((year) => {
      const sequence = sequences.get(seqKey(leg.lottery, leg.position, year));
      if (!sequence) missing.push(`25${year}`);
      return sequence ?? "";
    })
    .join("");
  const testStr = sequences.get(seqKey(leg.lottery, leg.position, leg.test_year)) ?? "";
  if (!testStr) missing.push(`25${leg.test_year}`);
  if (missing.length > 0) {
    return { choices: empty, error: `ยังไม่มีผลหวยปี ${[...new Set(missing)].join(", ")} ในแอปนี้` };
  }

  try {
    const analysis = analyzeGroup({
      trainStr,
      testStr,
      trainYears,
      formula,
      mode: "train",
      topN: options.topN ?? 10,
      capital,
      betPerNumber: leg.bet_per_number,
      payoutRate: leg.payout_rate,
    });
    if (!analysis) return { choices: empty, error: "ข้อมูลของปีนี้ไม่พอสำหรับคำนวณ" };
    return {
      choices: analysis.choices.map((choice) => ({
        rank: choice.rank,
        size: choice.size,
        testProfit: choice.profit,
      })),
      error: null,
    };
  } catch (caught) {
    return { choices: empty, error: caught instanceof Error ? caught.message : "คำนวณอันดับไม่สำเร็จ" };
  }
}
