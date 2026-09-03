/**
 * Engine backtest 2 ตัว — พอร์ตมาจาก `src/backtest.py` ของรีโป lottery-app
 * (`run_all_sizes` / `compute_risk_metrics` / `random_baseline`)
 *
 * ⚠️⚠️ ตัวเลขต้องตรงกับฝั่ง Python **เป๊ะทุกหลัก** ไม่ใช่ใกล้เคียง —
 * มีเทสต์เทียบกับผลจริงที่ export มาจาก Python: `npx tsx scripts/formula-check.ts`
 *
 * หัวใจของ engine (เหมือนฝั่ง Python เป๊ะ): แปลงปี test เป็น **"อันดับของเลขที่ออก
 * ในแต่ละงวด"** แล้วทุกอย่างเป็นเลขคณิตบน array นั้น
 *   ถูกที่ n ตัว ⟺ อันดับของเลขที่ออก < n
 *   กำไร(n) = เงินแทง × ( เรตจ่าย × จำนวนงวดที่ถูก − n × จำนวนงวด )
 * ⇒ เปลี่ยนทุน/เงินแทง/เรตจ่าย/n คำนวณใหม่ได้ทันทีโดยไม่ต้องอ่านข้อมูลดิบซ้ำ
 */

export interface BacktestParams {
  capital: number;
  betPerNumber: number;
  payoutRate: number;
}

export interface SizeResult {
  size: number;
  profit: number;
  wins: number;
  winRate: number;
  /** ติดลบสูงสุดเทียบกับทุนตั้งต้น (เป็นเลขติดลบ หรือ 0) */
  maxDrawdown: number;
  actualDays: number;
}

export interface AllSizesResult {
  /** เรียงกำไรมาก→น้อย · กำไรเท่ากันเอา n น้อยกว่าขึ้นก่อน (กติกาเดียวกับ Python) */
  results: SizeResult[];
  /** อันดับของเลขที่ออกในแต่ละงวดจริง — ข้อมูลชุดเดียวที่ต้องใช้คำนวณต่อ */
  ranks: number[];
  maxSize: number;
  /** จำนวนงวดจริง (ข้ามวันหยุด/ยังไม่ออกผล) */
  actualDays: number;
}

/** งวดที่ข้าม — วันหยุด (`xx`), ยังไม่ออกผล (`--`), ความยาวผิด, ไม่ใช่ตัวเลข */
export function isSkip(draw: string, digits = 2): boolean {
  const s = (draw ?? "").toLowerCase();
  if (s.length !== digits) return true;
  for (let i = 0; i < s.length; i += 1) {
    const code = s.charCodeAt(i);
    if (code < 48 || code > 57) return true;
  }
  return false;
}

/** ตัด sequence เป็นงวด ๆ แล้วเก็บเฉพาะงวดที่ออกผลจริง */
export function realDraws(sequence: string, digits = 2): string[] {
  const s = sequence ?? "";
  const out: string[] = [];
  for (let i = 0; i + digits <= s.length; i += digits) {
    const draw = s.slice(i, i + digits);
    if (!isSkip(draw, digits)) out.push(draw);
  }
  return out;
}

/**
 * อันดับของเลขที่ออกในแต่ละงวด (0 = เลขที่สูตรจัดไว้อันดับ 1)
 * เลขที่ไม่อยู่ใน pool → คืน `maxSize` ซึ่ง >= n เสมอ = ไม่มีทางถูก
 */
export function rankSeries(
  sortedNums: readonly string[],
  testStr: string,
  maxSize: number,
  digits = 2,
): number[] {
  const rankOf = new Map<string, number>();
  for (let i = 0; i < maxSize; i += 1) {
    const num = sortedNums[i];
    if (!rankOf.has(num)) rankOf.set(num, i);
  }
  return realDraws(testStr, digits).map((draw) => rankOf.get(draw) ?? maxSize);
}

/**
 * รันทุก n_bet 1..maxN พร้อมกัน — O(งวด × n) เหมือนฝั่ง numpy
 * sortedNums ต้องเรียงมาแล้วจากสูตร (n = หยิบ n ตัวแรก)
 */
export function runAllSizes(options: {
  testStr: string;
  sortedNums: readonly string[];
  maxN?: number;
  digits?: number;
} & BacktestParams): AllSizesResult {
  const { testStr, sortedNums, capital, betPerNumber, payoutRate } = options;
  const digits = options.digits ?? 2;
  const maxSize = Math.min(sortedNums.length, options.maxN ?? 99);
  if (maxSize < 1) {
    return { results: [], ranks: [], maxSize: 0, actualDays: 0 };
  }

  const ranks = rankSeries(sortedNums, testStr, maxSize, digits);
  const actualDays = ranks.length;
  const prizeMoney = betPerNumber * payoutRate;

  if (actualDays === 0) {
    const results: SizeResult[] = [];
    for (let n = 1; n <= maxSize; n += 1) {
      results.push({ size: n, profit: 0, wins: 0, winRate: 0, maxDrawdown: 0, actualDays: 0 });
    }
    sortResults(results);
    return { results, ranks, maxSize, actualDays: 0 };
  }

  const cumWins = new Int32Array(maxSize + 1);
  const minDiff = new Float64Array(maxSize + 1);
  for (let t = 0; t < actualDays; t += 1) {
    const rank = ranks[t];
    const rounds = t + 1;
    for (let n = 1; n <= maxSize; n += 1) {
      if (rank < n) cumWins[n] += 1;
      const diff = prizeMoney * cumWins[n] - betPerNumber * rounds * n;
      if (diff < minDiff[n]) minDiff[n] = diff;
    }
  }

  const results: SizeResult[] = [];
  for (let n = 1; n <= maxSize; n += 1) {
    const wins = cumWins[n];
    results.push({
      size: n,
      profit: prizeMoney * wins - betPerNumber * actualDays * n,
      wins,
      winRate: (wins / actualDays) * 100,
      // ต่ำสุดของเส้น แต่ไม่ต่ำกว่า 0 (จุดเริ่ม) — นิยามเดียวกับฝั่ง Python
      maxDrawdown: Math.min(0, minDiff[n]),
      actualDays,
    });
  }
  sortResults(results);
  return { results, ranks, maxSize, actualDays };
}

/** กำไรมาก→น้อย · เท่ากันเอา n น้อยกว่าก่อน (Python: sort by (profit, -size) reverse) */
function sortResults(results: SizeResult[]): void {
  results.sort((a, b) => (b.profit - a.profit) || (a.size - b.size));
}

/** เส้นทุนของ n ที่เลือก — [ทุนตั้งต้น, ...ทุนหลังจบแต่ละงวดจริง] */
export function equityCurve(
  ranks: readonly number[],
  size: number,
  params: BacktestParams,
): number[] {
  const { capital, betPerNumber, payoutRate } = params;
  const prizeMoney = betPerNumber * payoutRate;
  const curve = [capital];
  let wins = 0;
  for (let t = 0; t < ranks.length; t += 1) {
    if (ranks[t] < size) wins += 1;
    curve.push(capital + prizeMoney * wins - betPerNumber * (t + 1) * size);
  }
  return curve;
}

/* ─────────────────────────── ตัวเลขความเสี่ยง ─────────────────────────── */

export interface RiskMetrics {
  sharpe: number;
  /** null = ∞ (ไม่เคยขาดทุน) — ฝั่ง Python คืน inf ซึ่ง JSON เก็บไม่ได้ */
  profitFactor: number | null;
  maxWinStreak: number;
  maxLossStreak: number;
  maxLossStreakAmount: number;
  worstLossRunLen: number;
  worstLossRunAmount: number;
  avgWin: number;
  avgLoss: number;
}

/**
 * ปัดเลขแบบเดียวกับ `round()` ของ Python (half-to-even) —
 * ⚠️ JS `Math.round(2.5) = 3` แต่ Python `round(2.5) = 2` ⇒ ใช้ Math.round ตรง ๆ
 * แล้วตัวเลขจะต่างจากฝั่งโน้นในกรณีที่ลงท้ายด้วย .5 พอดี
 */
export function pyRound(value: number, digits = 0): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floor = Math.floor(scaled);
  const frac = scaled - floor;
  let rounded: number;
  if (frac > 0.5) rounded = floor + 1;
  else if (frac < 0.5) rounded = floor;
  else rounded = floor % 2 === 0 ? floor : floor + 1;
  // +0 กัน -0 ที่ JSON.stringify เขียนเป็น 0 แต่ Object.is แยกออก
  return (rounded / factor) + 0;
}

/**
 * Sharpe · Profit Factor · streak ต่าง ๆ จากเส้นทุน
 *
 * ⚠️ งวดที่ pnl = 0 (วันหยุด) **ไม่นับและไม่ตัด streak** — กติกาเดียวกับฝั่ง Python
 * streak ขาดทุนคืน 2 มุม: ช่วงที่ยาวที่สุด และช่วงที่ลบหนักที่สุด (มักคนละช่วง)
 */
export function computeRiskMetrics(equity: readonly number[]): RiskMetrics {
  if (equity.length < 2) {
    return {
      sharpe: 0, profitFactor: 0, maxWinStreak: 0, maxLossStreak: 0,
      maxLossStreakAmount: 0, worstLossRunLen: 0, worstLossRunAmount: 0,
      avgWin: 0, avgLoss: 0,
    };
  }

  const daily: number[] = [];
  for (let i = 1; i < equity.length; i += 1) daily.push(equity[i] - equity[i - 1]);

  const mean = daily.reduce((sum, d) => sum + d, 0) / daily.length;
  const variance = daily.reduce((sum, d) => sum + (d - mean) ** 2, 0) / daily.length;
  const std = Math.sqrt(variance);
  // Sharpe ต่อ "งวด" ไม่ annualize (หวยไม่ใช่สินทรัพย์รายวันต่อเนื่อง)
  const sharpe = std > 0 ? mean / std : 0;

  const wins = daily.filter((d) => d > 0);
  const losses = daily.filter((d) => d < 0);
  const grossWin = wins.reduce((sum, d) => sum + d, 0);
  const grossLoss = -losses.reduce((sum, d) => sum + d, 0);

  let maxWin = 0, maxLoss = 0, curWin = 0, curLoss = 0;
  let curLossAmt = 0, maxLossAmt = 0, worstAmt = 0, worstLen = 0;
  for (const d of daily) {
    if (d > 0) {
      curWin += 1;
      curLoss = 0;
      curLossAmt = 0;
      if (curWin > maxWin) maxWin = curWin;
    } else if (d < 0) {
      curLoss += 1;
      curLossAmt += d;
      curWin = 0;
      if (curLoss > maxLoss || (curLoss === maxLoss && curLossAmt < maxLossAmt)) {
        maxLoss = curLoss;
        maxLossAmt = curLossAmt;
      }
      if (curLossAmt < worstAmt) {
        worstAmt = curLossAmt;
        worstLen = curLoss;
      }
    }
  }

  const avg = (values: number[]) =>
    values.length > 0 ? values.reduce((sum, d) => sum + d, 0) / values.length : 0;

  return {
    sharpe: pyRound(sharpe, 2),
    profitFactor: grossLoss > 0 ? pyRound(grossWin / grossLoss, 2) : null,
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    maxLossStreakAmount: pyRound(maxLossAmt, 0),
    worstLossRunLen: worstLen,
    worstLossRunAmount: pyRound(worstAmt, 0),
    avgWin: pyRound(avg(wins), 0),
    avgLoss: pyRound(avg(losses), 0),
  };
}

/* ─────────────────────────── เทียบกับการสุ่ม ─────────────────────────── */

export interface RandomBaseline {
  expectedProfit: number;
  sdProfit: number;
  expectedHits: number;
  z: number | null;
  pBetter: number | null;
}

/**
 * "ถ้าสุ่มเลข n ตัวเท่ากันจะได้เท่าไร" — ตอบว่ากำไรที่เห็นเกินดวงแค่ไหน
 * ถูก ~ Binomial(งวดจริง, n/100) ⇒ ที่เรตจ่าย 100 ค่าคาดหวัง = 0 พอดี (เกมยุติธรรม)
 *
 * ⚠️ ตีความไม่ได้ถ้า n ถูกเลือกจากผล test แล้ว (โหมด Hindsight = เอียงเข้าข้างตัวเอง)
 */
export function randomBaseline(options: {
  nBet: number;
  actualDays: number;
  betPerNumber: number;
  payoutRate: number;
  actualProfit?: number | null;
  digits?: number;
}): RandomBaseline {
  const digits = options.digits ?? 2;
  const combos = 10 ** digits;
  const n = Math.max(0, Math.min(Math.trunc(options.nBet), combos));
  const days = Math.max(0, Math.trunc(options.actualDays));
  const p = n / combos;
  const prize = options.betPerNumber * options.payoutRate;
  const expectedHits = days * p;
  const expectedProfit = expectedHits * prize - days * n * options.betPerNumber;
  const sdProfit = prize * Math.sqrt(days * p * (1 - p));

  let z: number | null = null;
  let pBetter: number | null = null;
  if (options.actualProfit != null && sdProfit > 0) {
    z = (options.actualProfit - expectedProfit) / sdProfit;
    // p(สุ่มล้วนได้ดีเท่านี้หรือดีกว่า) = 0.5·erfc(z/√2) — normal approx เหมือน Python
    pBetter = 0.5 * erfc(z / Math.SQRT2);
  }
  return { expectedProfit, sdProfit, expectedHits, z, pBetter };
}

/** erfc ความละเอียดสูง (Numerical Recipes 6.2.2) — ผลตรงกับ math.erfc ของ Python ~1e-15 */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 2 / (2 + z);
  const ty = 4 * t - 2;
  const coefficients = [
    -1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
    -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
    4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
    1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
    6.529054439e-9, 5.059343495e-9, -9.91364156e-10,
    -2.27365122e-10, 9.6467911e-11, 2.394038e-12,
    -6.886027e-12, 8.94487e-13, 3.13092e-13,
    -1.12708e-13, 3.81e-16, 7.106e-15,
  ];
  let d = 0;
  let dd = 0;
  for (let j = coefficients.length - 1; j > 0; j -= 1) {
    const tmp = d;
    d = ty * d - dd + coefficients[j];
    dd = tmp;
  }
  const result = t * Math.exp(-z * z + 0.5 * (coefficients[0] + ty * d) - dd);
  return x >= 0 ? result : 2 - result;
}
