/**
 * POST ส่ง **รายงานสูตรของหวยตัวเดียว** เข้า LINE (ปุ่มในป๊อปอัปหน้า `/formulas`)
 *
 * ⚠️⚠️ หน้าเว็บส่งมาแค่ **ค่าที่ตั้ง** (หวย/สูตร/ปี/ทุน/เงินแทง) แล้วที่นี่ **คำนวณเอง
 * ใหม่ทั้งหมด** — ไม่รับตัวเลขสำเร็จรูปจาก client · เพราะการ์ดถูกส่งเข้ากลุ่มแล้วถอน
 * คืนไม่ได้ ตัวเลขที่ออกไปต้องมาจาก engine เท่านั้น ไม่ใช่จากสิ่งที่เบราว์เซอร์บอกมา
 * (engine เป็นไฟล์เดียวกับที่หน้าเว็บใช้ ⇒ ตัวเลขตรงกับที่เห็นบนจออยู่แล้ว)
 */

import { requireLotteryViewer } from "@/lib/auth";
import { appUrl, env } from "@/lib/env";
import { HttpError, ok, route } from "@/lib/http";
import { isReportConfigured, pushMessageResult, reportConfigProblem } from "@/lib/line";
import { readAllDatasetRows } from "@/lib/lottery/dataset-read";
import { randomBaseline } from "@/lib/lottery/engine";
import { FORMULAS } from "@/lib/lottery/formulas";
import { buildFormulaCard } from "@/lib/lottery/formula-card";
import {
  analyzeGroup,
  drawMonthDividers,
  monthlyFromEquity,
  trainYearsOf,
  type RankMode,
} from "@/lib/lottery/rank";
import { walkForwardByYear } from "@/lib/lottery/walk-forward";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  lottery?: string;
  position?: string;
  formula?: string;
  testYear?: string;
  trainYears?: string[];
  mode?: RankMode;
  capital?: number;
  betPerNumber?: number;
  payoutRate?: number;
  /** อันดับที่เลือกอยู่บนจอ (1-10) */
  rank?: number;
}

/** กันค่าที่ทำให้คำนวณค้าง/ล้น — ไม่ใช่แค่ "ไม่ใช่ตัวเลข" */
function intIn(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export const POST = route(async (request) => {
  await requireLotteryViewer(request);

  if (!isReportConfigured()) {
    throw new HttpError(400, reportConfigProblem() ?? "ไม่มีปลายทาง LINE", "line_not_ready");
  }
  const to = env("LINE_REPORT_TO");
  if (!to) throw new HttpError(400, "ยังไม่ได้ตั้ง LINE_REPORT_TO", "line_not_ready");

  const body = (await request.json().catch(() => ({}))) as Payload;
  const lottery = (body.lottery ?? "").trim();
  const position = (body.position ?? "").trim();
  const formula = (body.formula ?? "").trim();
  const testYear = (body.testYear ?? "").trim();

  if (!lottery || !position) throw new HttpError(400, "ต้องระบุหวยและตำแหน่ง", "bad_group");
  if (!FORMULAS[formula]) throw new HttpError(400, `ไม่รู้จักสูตร "${formula}"`, "bad_formula");
  if (!/^\d{2}$/.test(testYear)) throw new HttpError(400, "ปี test ต้องเป็น พ.ศ. 2 หลัก", "bad_year");

  const mode: RankMode = body.mode === "hindsight" ? "hindsight" : "train";
  const capital = intIn(body.capital, 100_000, 0, 1_000_000_000);
  const betPerNumber = intIn(body.betPerNumber, 100, 1, 1_000_000);
  const payoutRate = intIn(body.payoutRate, 100, 1, 10_000);
  const wantRank = intIn(body.rank, 1, 1, 10);

  // สูตรที่นี่เป็นสูตร 2 ตัวล้วน ⇒ ขอ `digits: 2` เสมอ ไม่งั้นผลสามบนจะถูกหั่นทีละ
  // 2 ตัวอักษรแล้วได้ "เลข" ที่ไม่ใช่ผลหวยอะไรเลย โดยไม่มี error ให้เห็น
  const all = await readAllDatasetRows({ digits: 2 });
  const entries = all.filter((row) => row.lottery === lottery && row.position === position);
  if (entries.length === 0) throw new HttpError(404, "ไม่มีผลหวยของกลุ่มนี้", "not_found");

  const flag = entries[0].flag ?? "🎰";
  const byYear = new Map<string, string>(entries.map((row) => [row.year, row.sequence ?? ""]));
  const testStr = byYear.get(testYear) ?? "";
  if (!testStr) throw new HttpError(404, `ไม่มีผลหวยปี 25${testYear}`, "not_found");

  const usedTrainYears = trainYearsOf([...byYear.keys()], testYear, body.trainYears);
  const trainStr = usedTrainYears.map((year) => byYear.get(year) ?? "").join("");

  const analysis = analyzeGroup({
    trainStr,
    testStr,
    trainYears: usedTrainYears,
    formula,
    mode,
    capital,
    betPerNumber,
    payoutRate,
  });
  if (!analysis) throw new HttpError(400, "ข้อมูลปีนี้ไม่พอสำหรับคำนวณ", "not_enough");
  const choice = analysis.choices.find((item) => item.rank === wantRank) ?? analysis.choices[0];
  if (!choice) throw new HttpError(400, "ไม่มีอันดับให้ส่ง", "not_enough");

  // walk-forward ใช้ **ทุกปีที่มี** เสมอ ไม่เกี่ยวกับปี train ที่เลือกบนจอ (กติกาเดิม)
  const yearSequences = [...byYear.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([year, seq]) => [year, seq] as [string, string]);
  let wf: ReturnType<typeof walkForwardByYear> | null = null;
  try {
    wf =
      yearSequences.length >= 2
        ? walkForwardByYear({ yearSequences, formula, capital, betPerNumber, payoutRate, nBet: null })
        : null;
  } catch {
    wf = null; // ส่งการ์ดใบเดียวได้ ไม่ต้องล้มทั้งคำขอ
  }

  const baseline = randomBaseline({
    nBet: choice.size,
    actualDays: choice.days,
    betPerNumber,
    payoutRate,
    actualProfit: choice.profit,
  });

  const messages = buildFormulaCard({
    flag,
    lottery,
    position,
    formula,
    testYear,
    mode,
    capital,
    betPerNumber,
    payoutRate,
    analysis,
    choice,
    wf,
    monthly: monthlyFromEquity(analysis.equityOf(choice.size), drawMonthDividers(testStr, testYear, 2)),
    z: baseline?.z ?? null,
    appUrl: appUrl(),
  });

  // ⚠️ `pushMessageResult` ไม่ใช่ `pushMessage` — ตัวหลังกลืน error แล้ว log เฉย ๆ
  //    หน้าจอจะขึ้นว่า "ส่งแล้ว" ทั้งที่ LINE ปฏิเสธไปตั้งแต่ต้น
  const result = await pushMessageResult(to, messages);
  if (!result.ok) throw new HttpError(502, result.error ?? "ส่งเข้า LINE ไม่สำเร็จ", "line_failed");

  return ok({ sent: true, messages: messages.length, rank: choice.rank, nBet: choice.size });
});
