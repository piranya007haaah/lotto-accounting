/**
 * การ์ด "รายงานสูตรรายหวย" ของจริง → พิมพ์ payload + ขนาดจริง โดยไม่ส่ง LINE
 *
 *   npx tsx scripts/formula-card-preview.ts [ชื่อสูตร]
 *
 * ⚠️ **ใช้ตรวจทุกครั้งที่แก้การ์ด** — เพดาน 30 KB ของ LINE เป็นของแต่ละข้อความ และ
 * เกินแล้วมันปฏิเสธทั้งข้อความ · มองไม่เห็นจากโค้ด ต้องรันกับข้อมูลจริงเท่านั้น
 */
import golden from "../src/lib/lottery/__fixtures__/walk-forward-golden.json";
import { randomBaseline } from "../src/lib/lottery/engine";
import { buildFormulaCard } from "../src/lib/lottery/formula-card";
import { analyzeGroup, drawMonthDividers, monthlyFromEquity, trainYearsOf } from "../src/lib/lottery/rank";
import { walkForwardByYear } from "../src/lib/lottery/walk-forward";

interface Case {
  lottery: string;
  position: string;
  formula: string;
  years: string[];
  sequences: Record<string, string>;
}
const data = golden as unknown as { cases: Case[] };
const wantFormula = process.argv[2];

const seen = new Set<string>();
let worst = 0;
let worstLabel = "";
let printed = false;

for (const item of data.cases) {
  if (wantFormula && item.formula !== wantFormula) continue;
  const key = `${item.lottery}|${item.position}|${item.formula}`;
  if (seen.has(key)) continue;
  seen.add(key);

  const years = [...item.years].sort();
  const testYear = years[years.length - 1];
  const trainYears = trainYearsOf(years, testYear);
  const analysis = analyzeGroup({
    trainStr: trainYears.map((y) => item.sequences[y] ?? "").join(""),
    testStr: item.sequences[testYear] ?? "",
    trainYears,
    formula: item.formula,
    mode: "train",
    capital: 100_000,
    betPerNumber: 100,
    payoutRate: 100,
  });
  const choice = analysis?.choices[0];
  if (!analysis || !choice) continue;

  const wf = walkForwardByYear({
    yearSequences: years.map((y) => [y, item.sequences[y] ?? ""] as [string, string]),
    formula: item.formula,
    capital: 100_000,
    betPerNumber: 100,
    payoutRate: 100,
    nBet: null,
  });
  const baseline = randomBaseline({
    nBet: choice.size, actualDays: choice.days,
    betPerNumber: 100, payoutRate: 100, actualProfit: choice.profit,
  });

  const messages = buildFormulaCard({
    flag: "🎰", lottery: item.lottery, position: item.position, formula: item.formula,
    testYear, mode: "train", capital: 100_000, betPerNumber: 100, payoutRate: 100,
    analysis, choice, wf, z: baseline?.z ?? null, appUrl: "https://lotto-accounting.vercel.app",
    monthly: monthlyFromEquity(analysis.equityOf(choice.size), drawMonthDividers(item.sequences[testYear] ?? "", testYear, 2)),
  });

  for (const message of messages) {
    const bytes = new TextEncoder().encode(JSON.stringify(message)).length;
    if (bytes > worst) {
      worst = bytes;
      worstLabel = `${item.lottery} ${item.position} · ${item.formula} · แทง ${choice.size} เลข`;
    }
  }
  if (!printed) {
    console.log(JSON.stringify(messages, null, 2));
    printed = true;
  }
}

const cap = 30_000;
const mark = worst > 29_000 ? "❌ เกินเพดานที่ตั้งไว้" : "✅ อยู่ในเพดาน";
console.error(
  `\n📇 ตรวจ ${seen.size} กลุ่ม · ใหญ่สุด ${(worst / 1000).toFixed(1)} KB ` +
    `(${worstLabel}) · เพดาน LINE ${cap / 1000} KB ต่อข้อความ — ${mark}`,
);
if (worst > 29_000) process.exit(1);
