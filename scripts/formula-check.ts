/**
 * ตรวจว่า engine ฝั่ง TypeScript ให้ตัวเลข **ตรงกับ Python เป๊ะ**
 *
 *   npx tsx scripts/formula-check.ts
 *
 * เทียบกับ "เฉลย" ที่ export มาจากรีโป lottery-app (ของจริงที่แอป Streamlit ใช้อยู่):
 *   python3 scripts/export_engine_fixture.py --out engine-golden.json
 *   → วางที่ src/lib/lottery/__fixtures__/engine-golden.json
 *
 * ⚠️ ตราบใดที่สองแอปยังมีอยู่พร้อมกัน เทสต์นี้คือสิ่งเดียวที่กันไม่ให้
 * "สูตรชื่อเดียวกันให้คนละคำตอบ" ซึ่งจะไม่มีใครจับได้จนกว่าจะเอาเลขไปแทงจริง
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน
 */
import golden from "../src/lib/lottery/__fixtures__/engine-golden.json";
import {
  computeRiskMetrics,
  equityCurve,
  randomBaseline,
  runAllSizes,
  type BacktestParams,
} from "../src/lib/lottery/engine";
import { FORMULAS } from "../src/lib/lottery/formulas";

interface GoldenRun {
  params: { capital: number; bet_per_number: number; payout_rate: number };
  profit: number[];
  wins: number[];
  maxDrawdown: number[];
  actualDays: number;
  bestSize: number;
  bestEquity: number[];
  bestRisk: Record<string, number>;
  bestBaseline: Record<string, number | null>;
}

interface GoldenCase {
  lottery: string;
  position: string;
  why: string;
  testYear: string;
  trainStr: string;
  testStr: string;
  formulas: Record<string, { sortedNums: string[]; runs: GoldenRun[] }>;
}

const data = golden as unknown as { formulaNames: string[]; cases: GoldenCase[] };

let checks = 0;
const failures: string[] = [];

function fail(where: string, detail: string): void {
  failures.push(`${where} — ${detail}`);
}

/**
 * เท่ากันแบบเป๊ะ — ยกเว้น **ศูนย์ติดลบ** ที่ถือว่าเท่ากับศูนย์ธรรมดา
 *
 * Python `round()` คืน `-0.0` ได้ (เช่น Sharpe ที่ปัดแล้วเป็นศูนย์จากค่าติดลบ) ซึ่ง
 * JSON เก็บเป็น `-0.0` จริง ๆ · ฝั่งเรา `pyRound` **ตั้งใจ** normalize เป็น `0`
 * เพราะไม่งั้นหน้าจอจะขึ้น "-0.00" ซึ่งคนอ่านนึกว่าบั๊ก — ตัวเลขเท่ากันทุกประการ
 */
function same(a: unknown, b: unknown): boolean {
  if (typeof a === "number" && typeof b === "number") {
    return a === b || (Number.isNaN(a) && Number.isNaN(b));
  }
  return Object.is(a, b);
}

function expectEqual(where: string, actual: unknown, expected: unknown): void {
  checks += 1;
  if (!same(actual, expected)) {
    fail(where, `ได้ ${JSON.stringify(actual)} · ควรเป็น ${JSON.stringify(expected)}`);
  }
}

function expectArrayEqual(where: string, actual: readonly unknown[], expected: readonly unknown[]): void {
  checks += 1;
  if (actual.length !== expected.length) {
    fail(where, `ความยาว ${actual.length} · ควรเป็น ${expected.length}`);
    return;
  }
  for (let i = 0; i < expected.length; i += 1) {
    if (!same(actual[i], expected[i])) {
      fail(where, `ตำแหน่ง ${i}: ได้ ${JSON.stringify(actual[i])} · ควรเป็น ${JSON.stringify(expected[i])}`);
      return;
    }
  }
}

for (const testCase of data.cases) {
  const label = `${testCase.lottery} · ${testCase.position} (เทส ${testCase.testYear})`;

  for (const [formulaName, expectedFormula] of Object.entries(testCase.formulas)) {
    const formula = FORMULAS[formulaName];
    if (!formula) {
      fail(label, `ไม่มีสูตรชื่อ "${formulaName}" ฝั่ง TypeScript`);
      continue;
    }

    // 1) ลำดับเลขที่สูตรจัดให้ — ต้องเหมือนกันทั้ง 100 ตัว ไม่ใช่แค่ Top-n
    const sortedNums = formula(testCase.trainStr);
    expectArrayEqual(`${label} · ${formulaName} · ลำดับเลข`, sortedNums, expectedFormula.sortedNums);

    for (const run of expectedFormula.runs) {
      const params: BacktestParams = {
        capital: run.params.capital,
        betPerNumber: run.params.bet_per_number,
        payoutRate: run.params.payout_rate,
      };
      const tag = `${label} · ${formulaName} · แทง ${params.betPerNumber} เรต ${params.payoutRate}`;

      const { results, ranks, actualDays } = runAllSizes({
        testStr: testCase.testStr,
        sortedNums,
        ...params,
      });
      expectEqual(`${tag} · จำนวนงวดจริง`, actualDays, run.actualDays);

      // 2) กำไร/ถูกกี่งวด/ติดลบสูงสุด ของทุก n_bet (fixture เรียงตาม size 1..N)
      const bySize = new Map(results.map((r) => [r.size, r]));
      const sizes = [...bySize.keys()].sort((a, b) => a - b);
      expectArrayEqual(`${tag} · กำไรทุก n`, sizes.map((s) => bySize.get(s)!.profit), run.profit);
      expectArrayEqual(`${tag} · ถูกกี่งวดทุก n`, sizes.map((s) => bySize.get(s)!.wins), run.wins);
      expectArrayEqual(
        `${tag} · ติดลบสูงสุดทุก n`,
        sizes.map((s) => bySize.get(s)!.maxDrawdown),
        run.maxDrawdown,
      );

      // 3) n ที่ดีสุด — กติกาตัดสินตอนกำไรเท่ากันต้องเหมือนกันด้วย
      expectEqual(`${tag} · n ที่กำไรดีสุด`, results[0].size, run.bestSize);

      // 4) เส้นทุนของ n นั้น (ตัวที่หน้าเว็บวาดจริง)
      const curve = equityCurve(ranks, run.bestSize, params);
      expectArrayEqual(`${tag} · เส้นทุน`, curve, run.bestEquity);

      // 5) ตัวเลขความเสี่ยง — ปัดเศษต้องแบบ Python (half-to-even) ไม่ใช่ Math.round
      const risk = computeRiskMetrics(curve);
      expectEqual(`${tag} · Sharpe`, risk.sharpe, run.bestRisk.sharpe);
      expectEqual(
        `${tag} · Profit Factor`,
        risk.profitFactor,
        Number.isFinite(run.bestRisk.profit_factor) ? run.bestRisk.profit_factor : null,
      );
      expectEqual(`${tag} · Win streak`, risk.maxWinStreak, run.bestRisk.max_win_streak);
      expectEqual(`${tag} · Loss streak`, risk.maxLossStreak, run.bestRisk.max_loss_streak);
      expectEqual(`${tag} · ลบช่วงนั้น`, risk.maxLossStreakAmount, run.bestRisk.max_loss_streak_amount);
      expectEqual(`${tag} · ช่วงแพ้หนักสุด (งวด)`, risk.worstLossRunLen, run.bestRisk.worst_loss_run_len);
      expectEqual(`${tag} · ช่วงแพ้หนักสุด (บาท)`, risk.worstLossRunAmount, run.bestRisk.worst_loss_run_amount);
      expectEqual(`${tag} · กำไรเฉลี่ยงวดที่ถูก`, risk.avgWin, run.bestRisk.avg_win);
      expectEqual(`${tag} · ขาดทุนเฉลี่ยงวดที่แพ้`, risk.avgLoss, run.bestRisk.avg_loss);

      // 6) เทียบกับการสุ่ม — ตัวเลขทศนิยมยาว ยอมให้ต่างได้ระดับ floating point
      const baseline = randomBaseline({
        nBet: run.bestSize,
        actualDays: run.actualDays,
        betPerNumber: params.betPerNumber,
        payoutRate: params.payoutRate,
        actualProfit: bySize.get(run.bestSize)!.profit,
      });
      for (const [key, mine] of [
        ["expected_profit", baseline.expectedProfit],
        ["sd_profit", baseline.sdProfit],
        ["expected_hits", baseline.expectedHits],
        ["z", baseline.z],
        ["p_better", baseline.pBetter],
      ] as const) {
        const want = run.bestBaseline[key];
        checks += 1;
        if (want == null || mine == null) {
          if (!(want == null && mine == null)) fail(`${tag} · ${key}`, `ได้ ${mine} · ควรเป็น ${want}`);
        } else if (Math.abs(mine - want) > 1e-9 * Math.max(1, Math.abs(want))) {
          fail(`${tag} · ${key}`, `ได้ ${mine} · ควรเป็น ${want}`);
        }
      }
    }
  }
}

console.log(`\nเทียบกับเฉลยจาก Python: ${data.cases.length} กลุ่ม × ${data.formulaNames.length} สูตร`);
for (const testCase of data.cases) {
  console.log(`  · ${testCase.lottery} · ${testCase.position} (${testCase.why})`);
}

if (failures.length > 0) {
  console.error(`\n❌ ไม่ตรง ${failures.length} จุด (จาก ${checks} จุดที่ตรวจ)`);
  for (const message of failures.slice(0, 20)) console.error(`   ${message}`);
  if (failures.length > 20) console.error(`   … อีก ${failures.length - 20} จุด`);
  process.exit(1);
}

console.log(`\n✅ ตรงกับ Python ทั้งหมด — ตรวจไป ${checks.toLocaleString("th-TH")} จุด`);
