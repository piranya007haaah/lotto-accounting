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
  /** กำไรรายเดือนของปี test — [ชื่อเดือน, กำไร, ทุนต้นเดือน] */
  monthly: { label: string; profit: number; capitalStart: number }[];
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
  return bubble({
    kicker: `${input.formula} · อันดับ #${choice.rank}`,
    title: `${input.flag} ${shortLottery(input.lottery)} · ${shortPosition(input.position)}`,
    when: `วัดผลปี 25${input.testYear} · เทรนด้วย ${analysis.trainYears.map((y) => `25${y}`).join(", ")}`,
    body: rows,
  });
}

/** ใบ "ทุกอันดับ" — n ไหนก็ให้ผลใกล้กัน = สูตรทน ไม่ได้ขึ้นกับ n ที่เลือกเป๊ะ ๆ */
function ranksBubble(input: FormulaCardInput): LineMessage | null {
  const items = input.analysis.choices;
  if (items.length < 2) return null;

  const head: LineMessage = {
    type: "box",
    layout: "horizontal",
    contents: [
      text("อันดับ", { size: "xxs", color: DIM, flex: 3 }),
      text("แทง", { size: "xxs", color: DIM, align: "end", flex: 3 }),
      text("กำไร", { size: "xxs", color: DIM, align: "end", flex: 5 }),
      text(input.mode === "train" ? "ใน test" : "ถูก", { size: "xxs", color: DIM, align: "end", flex: 4 }),
    ],
  };

  const rows: LineMessage[] = [head, separator("xs")];
  for (const item of items) {
    const picked = item.rank === input.choice.rank;
    rows.push({
      type: "box",
      layout: "horizontal",
      margin: "xs",
      contents: [
        text(`#${item.rank}`, { size: "xxs", flex: 3, color: picked ? INK : DIM, ...(picked ? { weight: "bold" } : {}) }),
        text(String(item.size), { size: "xxs", align: "end", flex: 3, color: picked ? INK : DIM }),
        text(signed(item.profit), { size: "xxs", align: "end", flex: 5, color: tone(item.profit), ...(picked ? { weight: "bold" } : {}) }),
        text(
          input.mode === "train" ? `#${item.testRank}` : `${item.winRate.toFixed(1)}%`,
          { size: "xxs", align: "end", flex: 4, color: picked ? INK : DIM },
        ),
      ],
    });
  }

  rows.push(filler());
  rows.push(
    tally("อันดับที่เลือก", `#${input.choice.rank} · ${input.choice.size} เลข`, INK,
      input.mode === "train"
        ? "อันดับใน test ≤ 10 = n ที่เลือกจากอดีตก็ติด Top 10 ของปีจริงด้วย (overfit น้อย)"
        : "โหมดรู้ผลแล้ว — เป็นเพดานทฤษฎี ไม่ใช่ผลที่เลือกได้จริงตอนนั้น"),
  );

  return bubble({
    kicker: `${items.length} อันดับ · แถวหนา = ที่เลือกอยู่`,
    title: "ควรแทงกี่เลข",
    when: "n ไหนก็ใกล้กัน = สูตรทน ไม่ได้ขึ้นกับ n ที่เลือกเป๊ะ ๆ",
    body: rows,
  });
}

/** ใบ "กำไรรายเดือน" ของปี test — เดือนไหนพัง เดือนไหนแบก */
function monthlyBubble(input: FormulaCardInput): LineMessage | null {
  if (input.monthly.length < 2) return null;
  const rows: LineMessage[] = [];
  input.monthly.forEach((month, i) => {
    if (i > 0) rows.push(separator("xs"));
    rows.push(
      statRow(
        [
          text(month.label, { size: "xs", weight: "bold", color: INK }),
          text(`ทุนต้นเดือน ${baht(month.capitalStart)}`, { size: "xxs", color: DIM }),
        ],
        signed(month.profit),
        tone(month.profit),
      ),
    );
  });

  const up = input.monthly.filter((month) => month.profit >= 0).length;
  rows.push(filler());
  rows.push(
    tally("รวมทั้งปี", signed(input.choice.profit), tone(input.choice.profit),
      `บวก ${up} เดือน · ลบ ${input.monthly.length - up} เดือน`),
  );

  return bubble({
    kicker: `ปี 25${input.testYear} · ${input.monthly.length} เดือน`,
    title: "เดือนไหนพัง เดือนไหนแบก",
    when: "กำไรทั้งปีก้อนเดียวซ่อนเรื่องนี้ไว้หมด",
    body: rows,
  });
}

/** ใบ "เลขที่แทง" — แยกใบเพราะชุดเลขยาว ยัดรวมแล้วใบอื่นถูกลากให้สูงตาม */
function numbersBubble(input: FormulaCardInput): LineMessage {
  const picked = input.analysis.numbers.slice(0, input.choice.size);
  const perRow = 10;
  const rows: LineMessage[] = [];
  for (let i = 0; i < picked.length; i += perRow) {
    rows.push(text(picked.slice(i, i + perRow).join("  "), { size: "sm", color: INK, margin: i === 0 ? "none" : "xs" }));
  }
  rows.push(filler());
  rows.push(
    tally("ต้นทุนต่องวด", `${baht(input.choice.size * input.betPerNumber)} บ.`, INK,
      `${input.choice.size} เลข × ${baht(input.betPerNumber)} บ. · เรียงจากดีสุดไปแย่สุด`),
  );

  return bubble({
    kicker: `อันดับ #${input.choice.rank}`,
    title: `เลขที่แทง ${picked.length} ตัว`,
    when: `${input.formula} · เทรนด้วย ${input.analysis.trainYears.map((y) => `25${y}`).join(", ")}`,
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

  // เรียงตามลำดับที่คนอ่านต้องการรู้: สรุป → ควรแทงกี่เลข → เดือนไหนพัง →
  // ใช้มาตลอดแล้วเป็นไง → เลขที่จะแทงจริง
  const bubbles: LineMessage[] = [mainBubble(input)];
  const ranks = ranksBubble(input);
  if (ranks) bubbles.push(ranks);
  const months = monthlyBubble(input);
  if (months) bubbles.push(months);
  if (input.wf && input.wf.folds.length > 0) bubbles.push(wfBubble(input, input.wf, []));
  bubbles.push(numbersBubble(input));

  // ปุ่มเกาะใบสุดท้ายเสมอ ไม่ว่าจะมีกี่ใบ
  bubbles[bubbles.length - 1].footer = {
    type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: buttons,
  };

  const alt =
    `${input.flag} ${shortLottery(input.lottery)} ${shortPosition(input.position)} · ${input.formula} · ` +
    `ปี 25${input.testYear} → ${signed(input.choice.profit)}`;
  return [flex(alt, bubbles)];
}
