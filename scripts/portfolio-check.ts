/**
 * ตรวจว่า engine พอร์ตฝั่ง TypeScript ให้ตัวเลขตรงกับ Python เป๊ะ
 *
 *   npx tsx scripts/portfolio-check.ts
 *
 * ตัวที่สามของชุด (`formula-check.ts` = engine 2 ตัว · `rank-check.ts` = การเลือก n_bet)
 * ตัวนี้ตรวจชั้นบนสุด: `computeSnapshot()` ทั้งก้อน เทียบ **ทุกคีย์** ของ snapshot
 * ที่ Python คำนวณไว้ — KPI · เส้นทุนทุกจุด · กำไรรายเดือน · ทุกขา (เส้น/เลข/win rate)
 * ยกเว้น `generated_at` / `received_at` ซึ่งเป็นเวลาที่สร้าง ไม่ใช่ผลการคำนวณ
 *
 * เฉลยสร้างที่ฝั่ง lottery-app:
 *   python3 scripts/export_portfolio_fixture.py \
 *     --out <ที่นี่>/src/lib/lottery/__fixtures__/portfolio-golden.json
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน
 */
import golden from "../src/lib/lottery/__fixtures__/portfolio-golden.json";
import { computeSnapshot, requiredSequenceKeys, type DatasetSequence } from "../src/lib/lottery/portfolio-engine";
import { portfolioSchema } from "../src/lib/lottery/portfolio-config";
import type { PortfolioSnapshot } from "../src/lib/types";

/* ── รูปที่ Python ส่งมา (snake_case) — เทียบตรง ๆ ไม่ผ่าน zod ของ API ────────
 * ตั้งใจไม่ใช้ `snapshotPayloadSchema` เพราะไฟล์นั้นเป็นของช่วงงานอื่น: ถ้าที่นั่น
 * เผลอเพิ่ม `.default()` ให้คีย์ไหน สคริปต์นี้จะ "ผ่าน" ทั้งที่ engine ไม่ได้คำนวณ */
interface PyLeg {
  index: number;
  name: string;
  formula: string;
  digits: number;
  n_bet: number;
  bet_per_number: number;
  payout_rate: number;
  profit: number;
  max_real_loss: number;
  worst_month_dd: number;
  loss_streak: number;
  loss_streak_amount: number;
  wins: number;
  draws: number;
  win_rate: number;
  curve: number[];
  numbers: string[];
  month_sets: Record<string, string[]>;
}

interface PySnapshot {
  version: number;
  portfolio: {
    id: number;
    name: string;
    capital: number;
    n_legs: number;
    test_years: string[];
    as_of: string;
    is_active: boolean;
  };
  kpi: Record<string, number | string | null>;
  equity: { capital: number; values: number[]; month_divs: [string, number][] };
  monthly: {
    label: string;
    capital_start: number;
    profit: number;
    max_dd: number;
    idx_start: number;
    idx_end: number;
  }[];
  legs: PyLeg[];
}

interface Case {
  portfolio: { id: number; name: string; source: string; capital: number; config: unknown };
  sequenceKeys: string[];
  snapshot: PySnapshot;
}

interface Fixture {
  sequences: (DatasetSequence & { key: string })[];
  cases: Case[];
}

const fixture = golden as unknown as Fixture;
const seqByKey = new Map(fixture.sequences.map((row) => [row.key, row]));

let checks = 0;
const failures: string[] = [];

function fail(where: string, actual: unknown, wanted: unknown): void {
  failures.push(`${where} — ได้ ${short(actual)} ควรเป็น ${short(wanted)}`);
}

function short(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) return String(value);
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

function expect(where: string, actual: unknown, wanted: unknown): void {
  checks += 1;
  if (!Object.is(actual, wanted) && actual !== wanted) fail(where, actual, wanted);
}

/** เทียบ array ตัวเลขทีละจุด — รายงานจุดแรกที่ต่างพร้อม index (หา bug ได้ไว) */
function expectArray(where: string, actual: readonly number[] | undefined, wanted: readonly number[]): void {
  checks += 1;
  if (!actual || actual.length !== wanted.length) {
    fail(`${where} · ความยาว`, actual?.length, wanted.length);
    return;
  }
  for (let i = 0; i < wanted.length; i += 1) {
    if (!Object.is(actual[i], wanted[i])) {
      fail(`${where} · จุดที่ ${i}`, actual[i], wanted[i]);
      return;
    }
  }
}

function expectStrings(where: string, actual: readonly string[] | undefined, wanted: readonly string[]): void {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) fail(where, actual, wanted);
}

for (const item of fixture.cases) {
  const label = `[${item.portfolio.id}] ${item.portfolio.name}`;
  const parsed = portfolioSchema.safeParse(item.portfolio);
  if (!parsed.success) {
    failures.push(`${label} — config ไม่ผ่าน zod: ${parsed.error.issues[0]?.message ?? "?"}`);
    continue;
  }
  const portfolio = parsed.data;

  // โหลดผลหวยเท่าที่ engine บอกว่าต้องใช้ — ต้องได้ครบตามที่เฉลยเตรียมไว้
  const wantedKeys = requiredSequenceKeys(portfolio)
    .map((k) => `${k.lottery}|${k.position}|${k.year}|${k.digits}`)
    .sort();
  expectStrings(`${label} · sequence ที่ต้องใช้`, wantedKeys, [...item.sequenceKeys].sort());

  const sequences: DatasetSequence[] = [];
  for (const key of item.sequenceKeys) {
    const row = seqByKey.get(key);
    if (!row) {
      failures.push(`${label} — ไม่มี sequence "${key}" ในเฉลย`);
      continue;
    }
    sequences.push(row);
  }

  let snapshot: PortfolioSnapshot;
  try {
    snapshot = computeSnapshot({ portfolio, sequences });
  } catch (error) {
    failures.push(`${label} — computeSnapshot โยน error: ${(error as Error).message}`);
    continue;
  }

  const py = item.snapshot;
  expect(`${label} · version`, snapshot.version, py.version);
  expect(`${label} · portfolioId`, snapshot.portfolioId, py.portfolio.id);
  expect(`${label} · name`, snapshot.name, py.portfolio.name);
  expect(`${label} · isActive`, snapshot.isActive, py.portfolio.is_active);
  expect(`${label} · capital`, snapshot.capital, py.portfolio.capital);
  expect(`${label} · nLegs`, snapshot.nLegs, py.portfolio.n_legs);
  expectStrings(`${label} · testYears`, snapshot.testYears, py.portfolio.test_years);
  expect(`${label} · asOf (ข้อมูลถึง)`, snapshot.asOf, py.portfolio.as_of);

  const kpiPairs: [keyof PortfolioSnapshot["kpi"], string][] = [
    ["capital", "capital"],
    ["profit", "profit"],
    ["roiPct", "roi_pct"],
    ["maxDrawdown", "max_drawdown"],
    ["sharpe", "sharpe"],
    ["profitFactor", "profit_factor"],
    ["maxWinStreak", "max_win_streak"],
    ["maxLossStreak", "max_loss_streak"],
    ["maxLossStreakAmount", "max_loss_streak_amount"],
    ["worstLossRunLen", "worst_loss_run_len"],
    ["worstLossRunAmount", "worst_loss_run_amount"],
    ["reserveNeeded", "reserve_needed"],
    ["worstMonthDd", "worst_month_dd"],
    ["worstMonthLabel", "worst_month_label"],
    ["wins", "wins"],
    ["draws", "draws"],
    ["winRate", "win_rate"],
  ];
  for (const [ours, theirs] of kpiPairs) {
    expect(`${label} · kpi.${theirs}`, snapshot.kpi[ours], py.kpi[theirs]);
  }

  expect(`${label} · equity.capital`, snapshot.equity.capital, py.equity.capital);
  expectArray(`${label} · equity.values`, snapshot.equity.values, py.equity.values);
  expectStrings(
    `${label} · equity.monthDivs`,
    snapshot.equity.monthDivs.map((d) => `${d[0]}@${d[1]}`),
    py.equity.month_divs.map((d) => `${d[0]}@${d[1]}`),
  );

  expect(`${label} · จำนวนเดือน`, snapshot.monthly.length, py.monthly.length);
  for (const [i, wanted] of py.monthly.entries()) {
    const got = snapshot.monthly[i];
    const where = `${label} · เดือน ${wanted.label}`;
    expect(`${where} · label`, got?.label, wanted.label);
    expect(`${where} · ทุนต้นเดือน`, got?.capitalStart, wanted.capital_start);
    expect(`${where} · กำไรสุทธิ`, got?.profit, wanted.profit);
    expect(`${where} · Max DD ในเดือน`, got?.maxDd, wanted.max_dd);
    expect(`${where} · idxStart`, got?.idxStart, wanted.idx_start);
    expect(`${where} · idxEnd`, got?.idxEnd, wanted.idx_end);
  }

  expect(`${label} · จำนวนขา`, snapshot.legs.length, py.legs.length);
  for (const [i, wanted] of py.legs.entries()) {
    const got = snapshot.legs[i];
    const where = `${label} · ขา ${wanted.index} ${wanted.name}`;
    if (!got) {
      failures.push(`${where} — ไม่มีขานี้ฝั่ง TypeScript`);
      continue;
    }
    expect(`${where} · index`, got.index, wanted.index);
    expect(`${where} · name`, got.name, wanted.name);
    expect(`${where} · formula`, got.formula, wanted.formula);
    expect(`${where} · digits`, got.digits, wanted.digits);
    expect(`${where} · n_bet`, got.nBet, wanted.n_bet);
    expect(`${where} · เงินแทง/ตัว`, got.betPerNumber, wanted.bet_per_number);
    expect(`${where} · เรตจ่าย`, got.payoutRate, wanted.payout_rate);
    expect(`${where} · กำไร`, got.profit, wanted.profit);
    expect(`${where} · ขาดทุนจริงสูงสุด`, got.maxRealLoss, wanted.max_real_loss);
    expect(`${where} · DD เดือนแย่สุด`, got.worstMonthDd, wanted.worst_month_dd);
    expect(`${where} · Loss streak`, got.lossStreak, wanted.loss_streak);
    expect(`${where} · ลบช่วงนั้น`, got.lossStreakAmount, wanted.loss_streak_amount);
    expect(`${where} · ถูกกี่งวด`, got.wins, wanted.wins);
    expect(`${where} · แทงกี่งวด`, got.draws, wanted.draws);
    expect(`${where} · win rate`, got.winRate, wanted.win_rate);
    expectArray(`${where} · เส้นกำไร`, got.curve, wanted.curve);
    expectStrings(`${where} · เลขที่แทง`, got.numbers, wanted.numbers);
    expectStrings(
      `${where} · เดือนที่ตั้งเลข`,
      Object.keys(got.monthSets),
      Object.keys(wanted.month_sets),
    );
    for (const [month, nums] of Object.entries(wanted.month_sets)) {
      expectStrings(`${where} · เลขเดือน ${month}`, got.monthSets[month], nums);
    }
  }
}

if (failures.length > 0) {
  console.error(`❌ ไม่ตรงกับ Python ${failures.length} จุด (จากทั้งหมด ${checks} จุด)`);
  for (const line of failures.slice(0, 25)) console.error(`   · ${line}`);
  if (failures.length > 25) console.error(`   … อีก ${failures.length - 25} จุด`);
  process.exit(1);
}

const legCount = fixture.cases.reduce((sum, item) => sum + item.snapshot.legs.length, 0);
console.log(
  `✅ engine พอร์ตตรงกับ Python ทั้งหมด — ${fixture.cases.length} พอร์ต · ` +
    `${legCount} ขา · ตรวจไป ${checks} จุด`,
);
