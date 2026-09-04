/**
 * ตรวจว่า "การเลือก n_bet + จัดอันดับ" ของหน้า `/formulas` ตรงกับ Python เป๊ะ
 *
 *   npx tsx scripts/rank-check.ts
 *
 * คู่กับ `formula-check.ts` (ซึ่งตรวจตัว engine) — ตัวนี้ตรวจชั้นที่อยู่เหนือขึ้นมา
 * คือ `src/lib/lottery/rank.ts` ที่ตัดสินใจว่า *จะแทงกี่เลข* ซึ่งเป็นจุดที่พลาดแล้ว
 * ตัวเลขยังดู "สมเหตุสมผล" อยู่ (แค่ดีเกินจริง) จนไม่มีใครจับได้:
 *   - Train-based ต้องจัดอันดับบน **train** เท่านั้น (ถ้าเผลอใช้ test = hindsight)
 *   - อันดับที่โชว์ต้องเป็นลำดับของ train ไม่ใช่เรียงกำไร test ใหม่
 *
 * เฉลยสร้างจากฝั่ง lottery-app (ใช้สตริงชุดเดียวกับ engine-golden.json):
 *   python3 scripts/export_engine_fixture.py \
 *     --rank-from <path>/engine-golden.json --out rank-golden.json
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน
 */
import engineGolden from "../src/lib/lottery/__fixtures__/engine-golden.json";
import rankGolden from "../src/lib/lottery/__fixtures__/rank-golden.json";
import { analyzeGroup, pickSize, type RankMode } from "../src/lib/lottery/rank";
import { FORMULAS } from "../src/lib/lottery/formulas";

interface PyParams {
  capital: number;
  bet_per_number: number;
  payout_rate: number;
}

interface PyRun {
  params: PyParams;
  train: {
    size: number;
    profit: number;
    wins: number;
    winRate: number;
    maxDrawdown: number;
    testRank: number;
    top10Sizes: number[];
  };
  hindsight: { size: number; profit: number; top10Sizes: number[] };
}

interface PyCase {
  lottery: string;
  position: string;
  testYear: string;
  formulas: Record<string, PyRun[]>;
}

interface EngineCase {
  lottery: string;
  position: string;
  testYear: string;
  trainYears: string[];
  trainStr: string;
  testStr: string;
}

const engineCases = (engineGolden as unknown as { cases: EngineCase[] }).cases;
const rankCases = (rankGolden as unknown as { cases: PyCase[] }).cases;

let checks = 0;
const failures: string[] = [];

function expect(where: string, actual: unknown, wanted: unknown): void {
  checks += 1;
  const same = Array.isArray(wanted)
    ? JSON.stringify(actual) === JSON.stringify(wanted)
    : Object.is(actual, wanted) || actual === wanted;
  if (!same) failures.push(`${where} — ได้ ${JSON.stringify(actual)} ควรเป็น ${JSON.stringify(wanted)}`);
}

for (const pyCase of rankCases) {
  const source = engineCases.find(
    (item) =>
      item.lottery === pyCase.lottery &&
      item.position === pyCase.position &&
      item.testYear === pyCase.testYear,
  );
  if (!source) {
    failures.push(`${pyCase.lottery} · ${pyCase.position} — ไม่มีสตริงใน engine-golden.json`);
    continue;
  }

  for (const [formula, runs] of Object.entries(pyCase.formulas)) {
    if (!FORMULAS[formula]) {
      failures.push(`${formula} — ไม่มีสูตรนี้ฝั่ง TypeScript`);
      continue;
    }
    const sortedNums = FORMULAS[formula](source.trainStr);

    for (const run of runs) {
      const params = {
        capital: run.params.capital,
        betPerNumber: run.params.bet_per_number,
        payoutRate: run.params.payout_rate,
      };
      const strings = {
        trainStr: source.trainStr,
        testStr: source.testStr,
        trainYears: source.trainYears,
      };
      const label = `${pyCase.lottery} · ${pyCase.position} · ${formula} · เรต ${run.params.payout_rate}`;

      const trainPick = pickSize(strings, sortedNums, params, "train");
      expect(`${label} · train n_bet`, trainPick?.chosen.size, run.train.size);
      expect(`${label} · train กำไร`, trainPick?.chosen.profit, run.train.profit);
      expect(`${label} · train ถูกกี่งวด`, trainPick?.chosen.wins, run.train.wins);
      expect(`${label} · train Max DD`, trainPick?.chosen.maxDrawdown, run.train.maxDrawdown);

      const hindsightPick = pickSize(strings, sortedNums, params, "hindsight");
      expect(`${label} · hindsight n_bet`, hindsightPick?.chosen.size, run.hindsight.size);
      expect(`${label} · hindsight กำไร`, hindsightPick?.chosen.profit, run.hindsight.profit);

      for (const mode of ["train", "hindsight"] as RankMode[]) {
        const analysis = analyzeGroup({
          trainStr: source.trainStr,
          testStr: source.testStr,
          trainYears: source.trainYears,
          formula,
          mode,
          ...params,
        });
        const wanted = mode === "train" ? run.train.top10Sizes : run.hindsight.top10Sizes;
        expect(
          `${label} · Top 10 (${mode})`,
          analysis?.choices.map((choice) => choice.size),
          wanted,
        );
        if (mode === "train") {
          expect(`${label} · อันดับใน test`, analysis?.choices[0]?.testRank, run.train.testRank);
        }
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ ไม่ตรงกับ Python ${failures.length} จุด (จากทั้งหมด ${checks} จุด)`);
  for (const line of failures.slice(0, 20)) console.error(`   · ${line}`);
  if (failures.length > 20) console.error(`   … อีก ${failures.length - 20} จุด`);
  process.exit(1);
}

console.log(`✅ การจัดอันดับตรงกับ Python ทั้งหมด — ตรวจไป ${checks} จุด`);
