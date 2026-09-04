/**
 * ตรวจว่า "ผลรายวัน" ที่การ์ด LINE ใช้ ตรงกับ **ยอดรวมของ Python** เป๊ะ
 *
 *   npx tsx scripts/day-check.ts
 *
 * วิธีตรวจ: เอา `computeDay()` ไล่ทุกวันของปี test แล้วบวกกัน ต้องได้เท่ากับ
 * `legs[].profit` / `wins` / `draws` ในเฉลย (`portfolio-golden.json` ที่ Python สร้าง)
 * ⇒ ถ้าวันไหนคิดพลาดแม้บาทเดียว ผลรวมจะไม่ลง — จับได้ตั้งแต่ตรงนี้ ไม่ใช่ตอนการ์ดส่งไปแล้ว
 *
 * ตรวจ `monthTable()` ด้วยกติกาเดียวกัน: รวม 12 เดือนต้องเท่ากับทั้งปีของขานั้น
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน
 */
import golden from "../src/lib/lottery/__fixtures__/portfolio-golden.json";
import { computeDay, monthTable, prepareReplay, yearBeOf } from "../src/lib/lottery/day-result";
import { yearBeToCe, type DatasetSequence } from "../src/lib/lottery/portfolio-engine";
import type { LotteryPortfolio } from "../src/lib/lottery/portfolio-config";

interface GoldenSeq {
  key: string;
  lottery: string;
  position: string;
  year: string;
  digits: number;
  sequence: string;
  is_date_sorted?: boolean;
}
interface GoldenCase {
  portfolio: LotteryPortfolio;
  sequenceKeys: string[];
  snapshot: {
    legs: { name: string; profit: number; wins: number; draws: number; digits: number }[];
  };
}

const data = golden as unknown as { sequences: GoldenSeq[]; cases: GoldenCase[] };
const byKey = new Map(data.sequences.map((s) => [s.key, s]));

let checks = 0;
const failures: string[] = [];
function expect(where: string, actual: unknown, wanted: unknown): void {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    failures.push(`${where}: ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(wanted)}`);
  }
}

for (const testCase of data.cases) {
  const { portfolio } = testCase;
  const sequences: DatasetSequence[] = testCase.sequenceKeys
    .map((key) => byKey.get(key))
    .filter((s): s is GoldenSeq => Boolean(s))
    .map((s) => ({
      lottery: s.lottery,
      position: s.position,
      year: s.year,
      digits: s.digits,
      sequence: s.sequence,
      isDateSorted: s.is_date_sorted ?? true,
    }));

  const replay = prepareReplay(portfolio, sequences);
  const years = [...new Set((portfolio.config.legs ?? []).map((leg) => String(leg.test_year)))];

  /** legIndex → ยอดสะสมจากการไล่ทีละวัน */
  const daily = new Map<number, { pnl: number; wins: number; draws: number }>();

  for (const yearBe of years) {
    let ce: number;
    try {
      ce = yearBeToCe(yearBe);
    } catch {
      continue;
    }
    const days = (new Date(Date.UTC(ce, 11, 31)).getTime() - Date.UTC(ce, 0, 1)) / 86_400_000 + 1;
    for (let i = 0; i < days; i += 1) {
      const date = new Date(Date.UTC(ce, 0, 1 + i));
      if (yearBeOf(date) !== yearBe) continue;
      const report = computeDay({ portfolio, replay, date });
      for (const group of report.lotteries) {
        for (const leg of group.legs) {
          const acc = daily.get(leg.legIndex) ?? { pnl: 0, wins: 0, draws: 0 };
          acc.pnl += leg.pnl;
          if (leg.status === "hit") acc.wins += 1;
          // "งวดที่ลงเงินจริง" — n=0 (เดือนที่ไม่ได้ตั้งเลข) ไม่นับ กติกาเดียวกับ /wr
          if (leg.status === "hit" || leg.status === "miss") acc.draws += 1;
          daily.set(leg.legIndex, acc);
        }
      }
    }
  }

  // เฉลยเรียงตามลำดับขาที่รันได้ (ขาที่รันไม่ได้ถูกข้าม) — เทียบตามลำดับเดียวกัน
  const ranLegIndexes = replay.configs.map((c) => c.legIndex ?? -1);
  testCase.snapshot.legs.forEach((wanted, i) => {
    const legIndex = ranLegIndexes[i];
    const got = daily.get(legIndex) ?? { pnl: 0, wins: 0, draws: 0 };
    const label = `พอร์ต ${portfolio.id} · ${wanted.name}`;
    expect(`${label} · กำไรรวมจากรายวัน`, Math.trunc(got.pnl), wanted.profit);
    expect(`${label} · จำนวนงวดที่ถูก`, got.wins, wanted.wins);
    expect(`${label} · จำนวนงวดที่ลงเงิน`, got.draws, wanted.draws);
  });

  /* ── ตารางรายเดือน: 12 เดือนรวมกันต้องเท่ากับทั้งปีของหวยนั้น ── */
  const lotteries = [...new Set((portfolio.config.legs ?? []).map((leg) => leg.lottery))];
  for (const lottery of lotteries) {
    for (const yearBe of years) {
      let ce: number;
      try {
        ce = yearBeToCe(yearBe);
      } catch {
        continue;
      }
      let sumMonths = 0;
      let sawTable = false;
      for (let month = 1; month <= 12; month += 1) {
        const table = monthTable({
          portfolio,
          replay,
          lottery,
          date: new Date(Date.UTC(ce, month - 1, 1)),
        });
        if (!table) continue;
        sawTable = true;
        sumMonths += table.pnl;
      }
      if (!sawTable) continue;
      const wholeYear = (portfolio.config.legs ?? [])
        .map((leg, index) => ({ leg, index }))
        .filter(({ leg }) => leg.lottery === lottery && String(leg.test_year) === yearBe)
        .reduce((s, { index }) => s + (daily.get(index)?.pnl ?? 0), 0);
      expect(
        `พอร์ต ${portfolio.id} · ${lottery} ปี ${yearBe} · 12 เดือนรวม = ทั้งปี`,
        Math.trunc(sumMonths),
        Math.trunc(wholeYear),
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ ผลรายวันไม่ตรง ${failures.length} จุด (จากทั้งหมด ${checks} จุด)`);
  for (const line of failures.slice(0, 20)) console.error(`   · ${line}`);
  if (failures.length > 20) console.error(`   … อีก ${failures.length - 20} จุด`);
  process.exit(1);
}
console.log(`✅ ผลรายวัน/รายเดือนตรงกับยอดรวมของ Python ทั้งหมด — ตรวจไป ${checks} จุด`);
