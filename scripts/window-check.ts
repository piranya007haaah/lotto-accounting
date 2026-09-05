/**
 * ตรวจว่า "ดูรายเดือน" ที่หน้าพอร์ต **ตัดช่วง** ถูกต้อง ไม่ใช่คำนวณใหม่คนละทาง
 *
 *   npx tsx scripts/window-check.ts
 *
 * กติกาที่ล็อกไว้ (ทุกพอร์ตในเฉลย · ทุกเดือน):
 *   1. กำไรทุกเดือนบวกกัน = กำไรทั้งปี  (ทั้งของพอร์ตและของ **ทุกขา**)
 *   2. ถูก/แทงทุกเดือนบวกกัน = ถูก/แทงทั้งปี — ตัวนี้จับ index ที่เลื่อนกัน 1 ระหว่าง
 *      เส้นทุน (`curve[i]` = หลังจบวันที่ i−1) กับผลหวย ซึ่งถ้าผิดจะนับวันแรกของเดือน
 *      ถัดไปซ้ำ แล้วยอดรวมจะเกินทั้งปีทันที
 *   3. ทุนต้นเดือนแรก = ทุนตั้งต้น · ทุนต้นเดือนถัดไป = ทุนต้นเดือนก่อน + กำไรเดือนก่อน
 *   4. จุดสุดท้ายของเส้นทุนเดือนสุดท้าย = จุดสุดท้ายของเส้นทุนทั้งปี
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน (ใช้เฉลยชุดเดียวกับ portfolio-check.ts)
 */
import golden from "../src/lib/lottery/__fixtures__/portfolio-golden.json";
import { portfolioSchema } from "../src/lib/lottery/portfolio-config";
import {
  computeSnapshot,
  replayPortfolio,
  type DatasetSequence,
} from "../src/lib/lottery/portfolio-engine";
import { sliceSnapshot, snapshotWindows } from "../src/lib/lottery/snapshot-window";

const fixture = golden as unknown as {
  cases: { portfolio: unknown; sequenceKeys: string[] }[];
  sequences: (DatasetSequence & { key: string })[];
};
const seqByKey = new Map(fixture.sequences.map((row) => [row.key, row]));

const failures: string[] = [];
let checks = 0;
let months = 0;

function eq(where: string, actual: number, wanted: number) {
  checks += 1;
  if (actual !== wanted) failures.push(`${where}: ได้ ${actual} · ควรเป็น ${wanted}`);
}

for (const item of fixture.cases) {
  const parsed = portfolioSchema.safeParse(item.portfolio);
  if (!parsed.success) continue;
  const portfolio = parsed.data;
  const label = `[${portfolio.id}] ${portfolio.name}`;

  const sequences: DatasetSequence[] = [];
  for (const key of item.sequenceKeys) {
    const row = seqByKey.get(key);
    if (row) sequences.push(row);
  }

  let snapshot;
  try {
    snapshot = computeSnapshot({ portfolio, sequences });
  } catch {
    continue; // พอร์ตที่รันไม่ได้ portfolio-check.ts จับไปแล้ว
  }
  const replay = replayPortfolio(portfolio.config.legs ?? [], snapshot.capital, sequences);
  const wins = snapshotWindows(snapshot).filter((w) => w.month != null);
  if (wins.length === 0) continue;

  let sumProfit = 0;
  let sumWins = 0;
  let sumDraws = 0;
  const sumLeg = new Map<number, number>();
  let prevCapital = snapshot.capital;
  let prevProfit = 0;
  let lastValue = snapshot.capital;

  for (const win of wins) {
    const view = sliceSnapshot(snapshot, win, replay);
    months += 1;
    sumProfit += view.kpi.profit;
    sumWins += view.kpi.wins;
    sumDraws += view.kpi.draws;
    for (const leg of view.legs) sumLeg.set(leg.index, (sumLeg.get(leg.index) ?? 0) + leg.profit);

    // ทุนต้นเดือนต้องต่อกันพอดี — ขาดหรือเกิน = ตัดช่วงคร่อม/ทับกัน
    eq(`${label} · ${win.key} ทุนต้นเดือน`, view.kpi.capital, prevCapital + prevProfit);
    prevCapital = view.kpi.capital;
    prevProfit = view.kpi.profit;
    lastValue = view.equity.values[view.equity.values.length - 1];

    // เส้นของขาต้องเริ่มที่ 0 เสมอ (เป็นกำไรสะสมของเดือนนั้น ไม่ใช่ของทั้งปี)
    for (const leg of view.legs) eq(`${label} · ${win.key} · ${leg.name} จุดแรก`, leg.curve[0], 0);
  }

  eq(`${label} · กำไรรวมทุกเดือน`, sumProfit, snapshot.kpi.profit);
  eq(`${label} · ถูกรวมทุกเดือน`, sumWins, snapshot.kpi.wins);
  eq(`${label} · แทงรวมทุกเดือน`, sumDraws, snapshot.kpi.draws);
  eq(`${label} · ปลายเส้นทุนเดือนสุดท้าย`, lastValue, snapshot.equity.values[snapshot.equity.values.length - 1]);
  for (const leg of snapshot.legs) {
    eq(`${label} · ${leg.name} กำไรรวมทุกเดือน`, sumLeg.get(leg.index) ?? 0, leg.profit);
  }
}

if (failures.length > 0) {
  console.error(`❌ ตัดช่วงรายเดือนไม่ตรงกับยอดทั้งปี ${failures.length} จุด`);
  for (const line of failures.slice(0, 25)) console.error(`   · ${line}`);
  process.exit(1);
}
console.log(`✅ ยอดรายเดือนบวกกันเท่ายอดทั้งปีทุกพอร์ต — ${months} เดือน · ตรวจไป ${checks} จุด`);
