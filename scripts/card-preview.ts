/**
 * สร้าง **การ์ด LINE ของจริง** จากโค้ดที่ deploy ไปแล้ว → ไฟล์ JSON
 *
 *   npx tsx scripts/card-preview.ts [ชื่อพอร์ต] [YYYY-MM-DD] > out/card.json
 *
 * ใช้ข้อมูลจริงจากเฉลย (`portfolio-golden.json` ที่ Python สร้าง) ⇒ ตัวเลขบนการ์ด
 * คือตัวเลขเดียวกับที่จะเจอตอนใช้จริง · ไม่ต่อเน็ต ไม่ส่ง LINE — แค่พิมพ์ payload ออกมา
 *
 * ไม่ใส่วันที่ = หาวันล่าสุดที่มีผลหวยอย่างน้อย 2 ตัวให้เอง
 */
import golden from "../src/lib/lottery/__fixtures__/portfolio-golden.json";
import { computeDay, monthTable, prepareReplay } from "../src/lib/lottery/day-result";
import { buildDrawCard } from "../src/lib/lottery/line-card";
import { computeSnapshot, yearBeToCe, type DatasetSequence } from "../src/lib/lottery/portfolio-engine";
import type { LotteryPortfolio } from "../src/lib/lottery/portfolio-config";

interface GoldenSeq {
  key: string; lottery: string; position: string; year: string;
  digits: number; sequence: string; is_date_sorted?: boolean;
}
const data = golden as unknown as {
  sequences: GoldenSeq[];
  cases: { portfolio: LotteryPortfolio; sequenceKeys: string[] }[];
};

const wantName = process.argv[2] ?? "Racer";
const wantDate = process.argv[3] ?? "";

const found = data.cases.find((c) => c.portfolio.name === wantName);
if (!found) throw new Error(`ไม่เจอพอร์ตชื่อ "${wantName}"`);

const byKey = new Map(data.sequences.map((s) => [s.key, s]));
const sequences: DatasetSequence[] = found.sequenceKeys
  .map((key) => byKey.get(key))
  .filter((s): s is GoldenSeq => Boolean(s))
  .map((s) => ({
    lottery: s.lottery, position: s.position, year: s.year,
    digits: s.digits, sequence: s.sequence, isDateSorted: s.is_date_sorted ?? true,
  }));

const portfolio = found.portfolio;
const replay = prepareReplay(portfolio, sequences);
const yearBe = String(portfolio.config.legs[0]?.test_year ?? "69");
const ce = yearBeToCe(yearBe);

/** วันล่าสุดที่มีหวยออกอย่างน้อย 2 ตัว (การ์ดจะได้มีใบ "วันนี้ถึงตอนนี้" ให้ดูด้วย) */
function pickDate(): Date {
  if (wantDate) {
    const [y, m, d] = wantDate.split("-").map((v) => Number.parseInt(v, 10));
    return new Date(Date.UTC(y, m - 1, d));
  }
  for (let i = 365; i >= 0; i -= 1) {
    const date = new Date(Date.UTC(ce, 0, 1 + i));
    const report = computeDay({ portfolio, replay, date });
    if (report.lotteries.filter((l) => !l.untouched).length >= 2) return date;
  }
  return new Date(Date.UTC(ce, 0, 1));
}

const date = pickDate();
const report = computeDay({ portfolio, replay, date });
const done = report.lotteries.filter((l) => !l.untouched);
// หวย "ที่เพิ่งกรอก" = ตัวที่ออกช้าสุดของวันนั้น (ตรงกับตอนใช้จริงที่กรอกไล่ตามเวลา)
const latest = done[done.length - 1]?.lottery ?? report.lotteries[0]?.lottery ?? "";

let snapshot = null;
try {
  snapshot = computeSnapshot({ portfolio, sequences });
} catch (error) {
  console.error(`⚠️ คำนวณ snapshot ไม่ได้: ${(error as Error).message}`);
}

const messages = buildDrawCard({
  report,
  lottery: latest,
  month: monthTable({ portfolio, replay, lottery: latest, date }),
  snapshot,
  appUrl: "https://lotto-accounting.vercel.app",
});

const sizes = messages.map((m) => {
  const c = m.contents as { type: string; contents?: unknown[] };
  const bubbles = c.type === "carousel" ? (c.contents as unknown[]).length : 1;
  return `${bubbles} ใบ/${(new TextEncoder().encode(JSON.stringify(m)).length / 1024).toFixed(1)} KB`;
});
console.error(
  `📇 ${portfolio.name} · ${date.toISOString().slice(0, 10)} · หวยล่าสุด ${latest} · ` +
  `${messages.length} ข้อความ (${sizes.join(" + ")}) · เพดาน LINE 30 KB ต่อข้อความ · ` +
  `วันนี้รวม ${report.pnl.toLocaleString("th-TH")} บ.`,
);
console.log(JSON.stringify(messages, null, 2));
