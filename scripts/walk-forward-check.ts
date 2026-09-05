/**
 * Walk-forward ฝั่ง TypeScript ตรงกับ engine Python ไหม
 *
 *   npx tsx scripts/walk-forward-check.ts
 *
 * เฉลย (`__fixtures__/walk-forward-golden.json`) สร้างจาก `backtest.walk_forward_by_year`
 * ของจริงในรีโป `lottery-app` — **อย่าแก้ด้วยมือ** เห็นไม่ตรงแปลว่าโค้ดที่นี่ผิด
 *
 * ⚠️ ตัวที่ต้องจับให้ได้ที่สุดคือ **การเลือก n_bet**: ต้องจัดอันดับบน train เท่านั้น
 * เผลอจัดบนปี test เมื่อไหร่ตัวเลขจะสวยขึ้นทันทีโดยไม่มีอะไรฟ้อง
 */
import golden from "../src/lib/lottery/__fixtures__/walk-forward-golden.json";
import { walkForwardByYear } from "../src/lib/lottery/walk-forward";

interface Case {
  lottery: string;
  position: string;
  formula: string;
  n_bet: number | null;
  years: string[];
  sequences: Record<string, string>;
  expect: {
    capital: number;
    equity_curve: number[];
    total_profit: number;
    wins: number;
    actual_days: number;
    win_rate: number;
    max_drawdown: number;
    folds: Record<string, unknown>[];
    monthly: Record<string, unknown>[];
    warnings: string[];
  };
}

const data = golden as unknown as { cases: Case[] };
const failures: string[] = [];
let checks = 0;

function eq(where: string, actual: unknown, wanted: unknown): void {
  checks += 1;
  const a = typeof actual === "number" ? Number(actual.toFixed(6)) : actual;
  const b = typeof wanted === "number" ? Number((wanted as number).toFixed(6)) : wanted;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    failures.push(`${where} — ได้ ${JSON.stringify(a)} · ควรเป็น ${JSON.stringify(b)}`);
  }
}

for (const item of data.cases) {
  const label = `${item.lottery} ${item.position} · ${item.formula} · n=${item.n_bet ?? "auto"}`;
  const got = walkForwardByYear({
    yearSequences: item.years.map((year) => [year, item.sequences[year]] as [string, string]),
    formula: item.formula,
    capital: 100_000,
    betPerNumber: 100,
    payoutRate: 100,
    nBet: item.n_bet,
  });
  const want = item.expect;

  eq(`${label} · capital`, got.capital, want.capital);
  eq(`${label} · กำไรรวม`, got.totalProfit, want.total_profit);
  eq(`${label} · ถูกกี่งวด`, got.wins, want.wins);
  eq(`${label} · กี่งวด`, got.actualDays, want.actual_days);
  eq(`${label} · win rate`, got.winRate, want.win_rate);
  eq(`${label} · Max DD`, got.maxDrawdown, want.max_drawdown);
  eq(`${label} · ความยาวเส้นทุน`, got.equityCurve.length, want.equity_curve.length);
  for (let i = 0; i < Math.min(got.equityCurve.length, want.equity_curve.length); i += 1) {
    if (got.equityCurve[i] !== want.equity_curve[i]) {
      eq(`${label} · เส้นทุน[${i}]`, got.equityCurve[i], want.equity_curve[i]);
      break; // เพี้ยนจุดเดียวก็พอ ไม่ต้องพ่นทั้งเส้น
    }
  }
  checks += 1;

  eq(`${label} · จำนวน fold`, got.folds.length, want.folds.length);
  for (const [i, wf] of want.folds.entries()) {
    const gf = got.folds[i];
    if (!gf) break;
    const at = `${label} · fold ${wf.year}`;
    eq(`${at} · n_bet`, gf.nBet, wf.n_bet);
    eq(`${at} · กำไร`, gf.profit, wf.profit);
    eq(`${at} · ROI`, gf.roiPct, wf.roi_pct);
    eq(`${at} · ถูก`, gf.wins, wf.wins);
    eq(`${at} · งวด`, gf.actualDays, wf.actual_days);
    eq(`${at} · win rate`, gf.winRate, wf.win_rate);
    eq(`${at} · Max DD`, gf.maxDrawdown, wf.max_drawdown);
    eq(`${at} · idxStart`, gf.idxStart, wf.idx_start);
    eq(`${at} · idxEnd`, gf.idxEnd, wf.idx_end);
    eq(`${at} · ปี train`, gf.trainYears, wf.train_years);
    eq(`${at} · เดือนแย่สุด`, gf.worstMonth, wf.worst_month);
    eq(`${at} · DD เดือนแย่สุด`, gf.worstMonthDd, wf.worst_month_dd);
  }

  eq(`${label} · จำนวนเดือน`, got.monthly.length, want.monthly.length);
  for (const [i, wm] of want.monthly.entries()) {
    const gm = got.monthly[i];
    if (!gm) break;
    const at = `${label} · เดือน ${wm.label}`;
    eq(`${at} · กำไร`, gm.profit, wm.profit);
    eq(`${at} · %`, gm.pct, wm.pct);
    eq(`${at} · ทุนต้นเดือน`, gm.equityStart, wm.equity_start);
    eq(`${at} · idxStart`, gm.idxStart, wm.idx_start);
    eq(`${at} · idxEnd`, gm.idxEnd, wm.idx_end);
    eq(`${at} · Max DD`, gm.maxDd, wm.max_dd);
  }

  eq(`${label} · คำเตือน`, got.warnings, want.warnings);
}

if (failures.length > 0) {
  console.error(`❌ ไม่ตรงกับ Python ${failures.length} จุด (จาก ${checks})`);
  for (const line of failures.slice(0, 25)) console.error("   " + line);
  if (failures.length > 25) console.error(`   … อีก ${failures.length - 25} จุด`);
  process.exit(1);
}
console.log(`✅ walk-forward ตรงกับ Python ทั้งหมด — ${data.cases.length} เคส · ตรวจไป ${checks} จุด`);
