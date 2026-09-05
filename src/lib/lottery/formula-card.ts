/**
 * การ์ด LINE ของ **รายงานสูตรรายหวย** — ปุ่ม "ส่งเข้า LINE" ในป๊อปอัปหน้า `/formulas`
 *
 * ตอบคำถามเดียวกับที่เห็นบนจอ: "หวยตัวนี้ใช้สูตรนี้แล้วเป็นยังไง" ⇒ เอาไปคุยต่อในกลุ่ม
 * ได้โดยไม่ต้องแคปหน้าจอ
 *
 * ⚠️ ตัวเลขทั้งหมดมาจาก `analyzeGroup` / `walkForwardByYear` ตัวเดียวกับหน้าเว็บ —
 * **ห้ามคำนวณอะไรใหม่ที่นี่** ไม่งั้นการ์ดกับจอจะไม่ตรงกันโดยไม่มีใครจับได้
 *
 * ⚠️ สีเขียว/แดงแยกไม่ออกด้วยตาบอดสี ⇒ ทุกตัวเลขมี **+/−** นำหน้าเสมอ (`signed`)
 */

import type { LineMessage } from "@/lib/line";
import {
  baht,
  bubble,
  DIM,
  filler,
  flex,
  INK,
  linkButton,
  separator,
  signed,
  statRow,
  tally,
  text,
  tone,
  shortLottery,
  shortPosition,
} from "./flex-kit";
import type { GroupAnalysis, RankChoice, RankMode } from "./rank";
import type { WalkForwardResult } from "./walk-forward";

export interface FormulaCardInput {
  flag: string;
  lottery: string;
  position: string;
  formula: string;
  testYear: string;
  mode: RankMode;
  capital: number;
  betPerNumber: number;
  payoutRate: number;
  analysis: GroupAnalysis;
  choice: RankChoice;
  /** null = ปีไม่พอทำ walk-forward (ยังส่งการ์ดได้ แค่ไม่มีใบที่สอง) */
  wf: WalkForwardResult | null;
  /** เกินสุ่มกี่ SD — null = คำนวณไม่ได้ */
  z: number | null;
  appUrl: string;
}

/** ใบที่ 1 — ผลของปี test ที่เลือก */
function mainBubble(input: FormulaCardInput): LineMessage {
  const { choice, analysis } = input;
  const rows: LineMessage[] = [];
  const add = (title: string, sub: string, value: string, color = INK) => {
    if (rows.length > 0) rows.push(separator("sm"));
    rows.push(
      statRow(
        [text(title, { size: "xs", weight: "bold", color: INK }), text(sub, { size: "xxs", color: DIM, wrap: true })],
        value,
        color,
      ),
    );
  };

  const turnover = choice.size * input.betPerNumber * choice.days;
  add(
    "กำไร",
    `แทง ${choice.size} เลข × ${baht(input.betPerNumber)} บ. · เรต ${baht(input.payoutRate)}`,
    signed(choice.profit),
    tone(choice.profit),
  );
  add(
    "อัตราถูก",
    // ⚠️ "ถูก 60%" อ่านแล้วไม่รู้ว่าดีไหมถ้าไม่รู้ว่าแทงกี่เลข ⇒ บอกเส้นเท่าทุนคู่กันเสมอ
    `${choice.wins}/${choice.days} งวด · เท่าทุนที่ ${((choice.size / input.payoutRate) * 100).toFixed(1)}%`,
    `${choice.winRate.toFixed(1)}%`,
  );
  add("ROI ต่อเงินหมุน", `เงินหมุนทั้งปี ${baht(turnover)} บ.`,
    `${choice.profit >= 0 ? "+" : "−"}${Math.abs(turnover > 0 ? (choice.profit / turnover) * 100 : 0).toFixed(1)}%`,
    tone(choice.profit));
  add("Max DD", "ต่ำสุดเทียบกับทุนตั้งต้น", baht(choice.maxDrawdown));
  if (input.mode === "train") {
    add(
      "อันดับใน test",
      choice.testRank <= 10 ? "ปีก่อนหน้าเดาไม่หลุด (overfit น้อย)" : "ปีก่อนหน้าเดาพลาด",
      `#${choice.testRank}`,
    );
  }
  if (input.z != null) {
    add("เกินการสุ่ม", `ถ้าสุ่ม ${choice.size} เลขเท่ากัน คาดหวัง 0`,
      `${input.z >= 0 ? "+" : "−"}${Math.abs(input.z).toFixed(1)} SD`);
  }

  rows.push(filler());
  rows.push(
    tally(`เลขที่แทง ${choice.size} ตัว`, "", INK,
      analysis.numbers.slice(0, choice.size).join(" ")),
  );

  return bubble({
    kicker: `${input.formula} · อันดับ #${choice.rank}`,
    title: `${input.flag} ${shortLottery(input.lottery)} · ${shortPosition(input.position)}`,
    when: `วัดผลปี 25${input.testYear} · เทรนด้วย ${analysis.trainYears.map((y) => `25${y}`).join(", ")}`,
    body: rows,
  });
}

/** ใบที่ 2 — walk-forward รายปี (ถ้าปีพอ) */
function wfBubble(input: FormulaCardInput, wf: WalkForwardResult, buttons: LineMessage[]): LineMessage {
  const rows: LineMessage[] = [];
  wf.folds.forEach((fold, i) => {
    if (i > 0) rows.push(separator("xs"));
    rows.push(
      statRow(
        [
          text(`25${fold.year}`, { size: "xs", weight: "bold", color: INK }),
          text(`แทง ${fold.nBet} เลข · ถูก ${fold.winRate.toFixed(1)}% · DD ${baht(fold.maxDrawdown)}`, {
            size: "xxs",
            color: DIM,
            wrap: true,
          }),
        ],
        signed(fold.profit),
        tone(fold.profit),
      ),
    );
  });

  rows.push(filler());
  rows.push(
    tally("รวมทุกปี", signed(wf.totalProfit), tone(wf.totalProfit),
      `ถูก ${wf.wins}/${wf.actualDays} งวด (${wf.winRate.toFixed(1)}%) · ทุน ${baht(wf.capital)} บ.`),
  );

  return bubble({
    kicker: `${wf.folds.length} ปี · ไม่มีการมองอนาคต`,
    title: "ถ้าใช้สูตรนี้มาตลอด",
    when: "ทุกปีเทรนด้วยปีก่อนหน้าทั้งหมด แล้ววัดผลบนปีนั้น",
    body: rows,
    footer: buttons,
  });
}

export function buildFormulaCard(input: FormulaCardInput): LineMessage[] {
  const buttons = [linkButton("เปิดหน้าสูตร", `${input.appUrl}/formulas`, true)];
  const bubbles: LineMessage[] = [mainBubble(input)];
  if (input.wf && input.wf.folds.length > 0) bubbles.push(wfBubble(input, input.wf, buttons));
  else bubbles[0].footer = { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: buttons };

  const alt =
    `${input.flag} ${shortLottery(input.lottery)} ${shortPosition(input.position)} · ${input.formula} · ` +
    `ปี 25${input.testYear} → ${signed(input.choice.profit)}`;
  return [flex(alt, bubbles)];
}
