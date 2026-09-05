/**
 * การ์ดผลหวยที่ส่งเข้า LINE — Flex **carousel** (เลื่อนขวาดูได้หลายใบ)
 *
 * ใบที่ประกอบขึ้นตามสถานการณ์ (สูงสุด 12 ใบต่อข้อความตามที่ LINE กำหนด):
 *   1. ผลของหวยที่เพิ่งกรอก          — งวดนี้
 *   2. วันนี้ถึงตอนนี้                — เฉพาะตอนที่วันนั้นมีหวยออกแล้วมากกว่า 1 ตัว
 *   3. ตารางรายวันของเดือน (หวยนั้น)  — คอลัมน์ = ตำแหน่ง · ท้ายตารางมี ถูก/ไม่ถูก/%/กำไร
 *   4. ภาพรวมทั้งพอร์ต                — เดือนนี้ / ปีนี้ / ทุนสำรอง / แพ้ติดกัน
 *   5. ขาไหนบวก ขาไหนลบ (ทั้งปี)      — + ปุ่มกลับเข้าเว็บ
 *
 * ⚠️ **ตัวเลขทุกตัวรับมาจากที่คำนวณแล้ว** (`computeDay` / `monthTable` / `computeSnapshot`)
 * ห้ามคำนวณอะไรใหม่ในไฟล์นี้ — ไม่งั้นเลขในการ์ดกับบนเว็บจะต่างกันโดยไม่มีใครรู้
 *
 * ⚠️ สีเขียว/แดงของแอปนี้แยกไม่ออกด้วยตาบอดสีเขียว-แดง ⇒ ทุกที่ต้องมี **เครื่องหมาย
 * +/− · ✅/❌ · พื้นหลังช่องที่ถูก** กำกับ สีเป็นของแถมเท่านั้น
 *
 * ⚠️ LINE จำกัด JSON ของข้อความ Flex ไว้ ~30 KB ⇒ ตารางรายวันตัดวันเก่าออกเองถ้าใหญ่ไป
 * (ดู `fitCarousel`) — ตัดแล้วต้องบอกบนการ์ดว่าตัด ไม่ใช่หายเงียบ ๆ
 */

import type { LineMessage } from "@/lib/line";
import {
  baht,
  bubble,
  DIM,
  flex,
  HEAD_BG,
  INK,
  jsonBytes,
  linkButton,
  MAX_JSON_BYTES,
  separator,
  signed,
  statRow,
  tally,
  text,
  TH_MONTHS,
  thaiDate,
  tone,
  shortLottery,
  shortPosition,
  UP,
  DOWN,
  filler,
} from "./flex-kit";
import type { PortfolioLeg, PortfolioMonth, PortfolioSnapshot } from "@/lib/types";
import type { DayReport, MonthTable } from "./day-result";

/* ─────────────────────────── ใบที่ 1: หวยที่เพิ่งกรอก ─────────────────────────── */

const STATUS_MARK: Record<string, string> = {
  hit: "✅",
  miss: "❌",
  "no-bet": "—",
  holiday: "—",
  pending: "—",
};

function drawBubble(
  report: DayReport,
  lottery: string,
  seq: number,
  month: MonthTable | null,
  monthLabel: string,
  corrected = false,
): LineMessage | null {
  const group = report.lotteries.find((l) => l.lottery === lottery);
  if (!group) return null;

  const rows: LineMessage[] = [];
  group.legs.forEach((leg, i) => {
    if (i > 0) rows.push(separator("sm"));
    const head =
      leg.status === "pending"
        ? `${leg.position} · ยังไม่มีผล`
        : leg.status === "holiday"
          ? `${leg.position} · งดออก`
          : leg.status === "no-bet"
            ? `${leg.position} · ออก ${leg.draw} (เดือนนี้ไม่ได้แทง)`
            : `${leg.position} · ออก ${leg.draw} ${STATUS_MARK[leg.status]}`;
    const label: LineMessage[] = [
      text(head, { size: "xs", weight: "bold", color: INK, wrap: true }),
      text(`แทง ${baht(leg.nBet)} เลข × ${baht(leg.betPerNumber)} บ. · เรต ${baht(leg.payoutRate)}`, {
        size: "xxs",
        color: DIM,
        wrap: true,
      }),
    ];
    const value = leg.status === "hit" || leg.status === "miss" ? signed(leg.pnl) : "—";
    rows.push(statRow(label, value, leg.status === "hit" || leg.status === "miss" ? tone(leg.pnl) : DIM));
  });

  // สถิติเดือนนี้ของหวยตัวนี้ — มาจาก monthTable ตัวเดียวกับตารางรายวันท้ายชุด
  // ⇒ เลขตรงกันเสมอ และช่วยให้ใบที่มีตำแหน่งเดียวไม่โล่ง
  if (month && month.columns.length > 0) {
    const hits = month.columns.reduce((sum, c) => sum + c.hits, 0);
    const draws = hits + month.columns.reduce((sum, c) => sum + c.misses, 0);
    if (draws > 0) {
      rows.push(separator("sm"));
      rows.push(
        statRow(
          [
            text(`เดือนนี้ · ${monthLabel}`, { size: "xs", weight: "bold", color: INK }),
            text(`ถูก ${hits} จาก ${draws} งวด (${((hits / draws) * 100).toFixed(1)}%)`, {
              size: "xxs",
              color: DIM,
              wrap: true,
            }),
          ],
          signed(month.pnl),
          tone(month.pnl),
        ),
      );
    }
  }

  rows.push(filler());
  rows.push(
    tally("รวมหวยนี้", signed(group.pnl), tone(group.pnl),
      `ลงเงินไป ${baht(group.cost)} บ. · ${group.legs.length} ตำแหน่ง`),
  );

  return bubble({
    // ส่งเข้า LINE แล้วถอนคืนไม่ได้ ⇒ การ์ดที่ส่งซ้ำเพราะแก้ผล ต้องประกาศตัวเองให้ชัด
    kicker: corrected
      ? `⚠️ แก้ไขผล · หวยที่ ${seq} จาก ${report.totalCount} ของวันนี้`
      : `หวยที่ ${seq} จาก ${report.totalCount} ของวันนี้`,
    title: `${group.flag} ${group.lottery}`,
    when: `${group.time ? `ออก ${group.time} น. · ` : ""}${thaiDate(report.date)}`,
    body: rows,
  });
}

/* ─────────────────────────── ใบที่ 2: วันนี้ถึงตอนนี้ ─────────────────────────── */

function dayBubble(report: DayReport): LineMessage | null {
  const done = report.lotteries.filter((l) => !l.untouched);
  if (done.length < 2) return null;

  const rows: LineMessage[] = [];
  done.forEach((group, i) => {
    if (i > 0) rows.push(separator("sm"));
    rows.push(
      statRow(
        [
          text(`${group.flag} ${shortLottery(group.lottery)}`, { size: "xs", weight: "bold", color: INK, wrap: true }),
          text(group.time ? `${group.time} น.` : "ไม่ได้ตั้งเวลา", { size: "xxs", color: DIM }),
        ],
        signed(group.pnl),
        tone(group.pnl),
      ),
    );
  });

  const roi = report.cost > 0 ? (report.pnl / report.cost) * 100 : 0;
  rows.push(filler());
  rows.push(
    tally("รวมวันนี้", signed(report.pnl), tone(report.pnl),
      `ลงเงินวันนี้ ${baht(report.cost)} บ. · ${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}% ของเงินที่ลง`),
  );

  const waiting = report.lotteries.filter((l) => l.untouched);
  rows.push(
    text(
      waiting.length > 0
        ? `ยังเหลืออีก ${waiting.length} หวย (${waiting.map((l) => l.time ?? "—").join(" · ")} น.) — ยังไม่ใช่ผลของทั้งวัน`
        : "ครบทุกหวยของวันนี้แล้ว",
      { size: "xxs", color: DIM, wrap: true, margin: "sm" },
    ),
  );

  return bubble({
    kicker: `พอร์ต ${report.portfolioName}`,
    title: "วันนี้ถึงตอนนี้",
    when: `ออกแล้ว ${report.doneCount} จาก ${report.totalCount} หวย · ${thaiDate(report.date)}`,
    body: rows,
  });
}

/* ─────────────────────── ใบที่ 3: ตารางรายวันของเดือน ─────────────────────── */

function monthBubble(table: MonthTable, maxDays: number): LineMessage | null {
  if (table.columns.length === 0 || table.days.length === 0) return null;
  const shown = table.days.slice(-maxDays);
  const trimmed = table.days.length - shown.length;

  // ช่องที่ถูก = **เขียวตัวหนา** · ไม่ถูก = **แดงตัวปกติ** (ไม่มีกล่องพื้นหลังแล้ว)
  // ⚠️ สีอย่างเดียวใช้ไม่ได้ — เขียว/แดงแยกไม่ออกด้วยตาบอดสี ⇒ **ความหนา** คือตัวบอก
  //    ความหมายจริง สีเป็นของแถม · หัวตารางบอกไว้ด้วยว่าตัวหนา = ถูก
  // ⚠️ ตารางเต็มเดือนมี 31 แถว × 2-3 คอลัมน์ ⇒ ทุกไบต์ต่อช่องคูณเกือบร้อย —
  //    ตัดกล่องห่อออกแล้วประหยัดไปครึ่งหนึ่ง ยิ่งห่างเพดาน 30 KB ของ LINE
  const cell = (value: string, status: string | undefined): LineMessage => {
    // วันหยุด/ยังไม่มีผล = สีจาง ไม่ใช่แดง — ไม่ได้แพ้ แค่ไม่มีงวด
    const color = status === "hit" ? UP : status === "miss" ? DOWN : DIM;
    return text(value, {
      size: "xxs",
      align: "center",
      flex: 3,
      color,
      ...(status === "hit" ? { weight: "bold" } : {}),
    });
  };

  const header: LineMessage = {
    type: "box",
    layout: "horizontal",
    contents: [
      text("วัน", { size: "xxs", color: DIM, flex: 2 }),
      ...table.columns.map((c) => text(shortPosition(c.position), { size: "xxs", color: DIM, align: "center", flex: 3 })),
    ],
  };

  const rows: LineMessage[] = shown.map((day) => ({
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      text(String(day), { size: "xxs", color: DIM, flex: 2 }),
      ...table.columns.map((c) => {
        const found = c.cells[day - 1];
        return cell(found?.draw ?? "—", found?.status);
      }),
    ],
  }));

  const footRow = (label: string, values: string[], colors?: string[]): LineMessage => ({
    type: "box",
    layout: "horizontal",
    margin: "xs",
    contents: [
      text(label, { size: "xxs", color: DIM, flex: 2 }),
      ...values.map((v, i) =>
        text(v, { size: "xxs", align: "center", flex: 3, weight: "bold", color: colors?.[i] ?? INK }),
      ),
    ],
  });

  const body: LineMessage[] = [header, separator("xs"), ...rows, separator("sm")];
  body.push(footRow("ถูก", table.columns.map((c) => String(c.hits))));
  body.push(footRow("ไม่ถูก", table.columns.map((c) => String(c.misses))));
  body.push(
    footRow("%", table.columns.map((c) =>
      c.hits + c.misses > 0 ? `${Math.round((c.hits / (c.hits + c.misses)) * 100)}%` : "—")),
  );
  body.push(
    footRow("กำไร", table.columns.map((c) => signed(c.pnl)), table.columns.map((c) => tone(c.pnl))),
  );
  if (trimmed > 0) {
    body.push(text(`(ตัดวันที่ 1–${table.days[trimmed - 1]} ออกเพราะการ์ดยาวเกิน — ตัวเลขท้ายตารางยังนับครบทั้งเดือน)`, {
      size: "xxs", color: DIM, wrap: true, margin: "sm",
    }));
  }
  body.push(
    tally("กำไรเดือนนี้ของหวยนี้", signed(table.pnl), tone(table.pnl),
      `ลงเงินไปทั้งเดือน ${baht(table.cost)} บ. · ${table.days.length} งวด`),
  );

  return bubble({
    kicker: `${TH_MONTHS[table.month]} 25${table.yearBe} · ${table.days.length} งวด`,
    title: `${table.flag} ${shortLottery(table.lottery)} รายวัน`,
    when: "ตัวหนา = ถูก · ตัวบาง = ไม่ถูก",
    body,
  });
}

/* ─────────────────────── ใบที่ 4-5: ภาพรวมพอร์ต / รายขา ─────────────────────── */

/** label ของ `snapshot.monthly` เป็นชื่อเดือนอังกฤษย่อ (มาจากฝั่ง Python) */
const EN_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * เดือนของวันที่ในการ์ด — จับจาก **label** ไม่ใช่ตำแหน่งในอาร์เรย์
 * (อาร์เรย์ไม่จำเป็นต้องเริ่มที่ ม.ค. ถ้าพอร์ตเริ่มกลางปี)
 */
function monthOf(snapshot: PortfolioSnapshot, date: Date): PortfolioMonth | null {
  const want = EN_MONTHS[date.getUTCMonth()];
  return snapshot.monthly.find((m) => m.label === want) ?? null;
}

/**
 * กำไรของขา **เฉพาะเดือนนั้น** = ปลายช่วง − ต้นช่วง ของเส้นกำไรสะสม
 *
 * ⚠️ ทำได้เพราะ `leg.curve` กับ `monthly[].idxStart/idxEnd` เป็น **วันปฏิทินจาก 1 ม.ค.**
 * ชุดเดียวกัน (กติกาเดียวกับ `LegReport`) — ห้ามนับเป็น "งวดที่" เพราะวันหยุดก็กิน index
 */
function legProfitIn(leg: PortfolioLeg, month: PortfolioMonth | null): number {
  if (!month || leg.curve.length < 2) return leg.profit;
  const at = (i: number) => leg.curve[Math.min(Math.max(i, 0), leg.curve.length - 1)] ?? 0;
  return at(month.idxEnd) - at(month.idxStart);
}

function portfolioBubble(snapshot: PortfolioSnapshot, monthLabel: string, month: PortfolioMonth | null): LineMessage {
  const kpi = snapshot.kpi;
  const rows: LineMessage[] = [];
  const add = (title: string, sub: string, value: string, color = INK) => {
    if (rows.length > 0) rows.push(separator("sm"));
    rows.push(statRow([
      text(title, { size: "xs", weight: "bold", color: INK }),
      text(sub, { size: "xxs", color: DIM, wrap: true }),
    ], value, color));
  };

  // เดือนนี้มาก่อนเสมอ — เจ้าของถอนกำไรทุกเดือน ตัวเลขที่ใช้ตัดสินใจคือของเดือนนี้
  if (month) {
    add("กำไรเดือนนี้", `${monthLabel} · ร่วงหนักสุดในเดือน ${baht(month.maxDd)}`,
      signed(month.profit), tone(month.profit));
  }
  add("กำไรทั้งปี", `${kpi.roiPct >= 0 ? "+" : "−"}${Math.abs(kpi.roiPct).toFixed(1)}% ของทุน ${baht(kpi.capital)} บ.`,
    signed(kpi.profit), tone(kpi.profit));
  add("ทุนสำรองที่ควรมี", "ต้องมีเงินทนเท่านี้ถึงจะไม่ต้องเลิกกลางทาง", baht(kpi.reserveNeeded));
  add("แพ้ติดกันสูงสุด", `ลบช่วงนั้น ${signed(kpi.maxLossStreakAmount)}`, `${kpi.maxLossStreak} งวด`);

  return bubble({
    kicker: `พอร์ต ${snapshot.name} · ${snapshot.nLegs} ขา`,
    title: "ภาพรวมทั้งพอร์ต",
    when: `ข้อมูลถึง ${snapshot.asOf}`,
    body: rows,
  });
}

/** "🇻🇳 หวยฮานอยพิเศษ · สามบน (เทส 69)" → "🇻🇳 หวยฮานอยพิเศษ · สามบน" (ทั้งใบปีเดียวกัน) */
function legName(name: string): string {
  return name.replace(/\s*\(เทส\s*\d+\)\s*$/, "");
}

function legsBubble(
  snapshot: PortfolioSnapshot,
  monthLabel: string,
  month: PortfolioMonth | null,
  buttons: LineMessage[],
): LineMessage {
  // ทุกตัวเลขในใบนี้เป็น **ของเดือนนั้น** — เรียง/สเกลแถบ/ยอดรวม ต้องมาจากชุดเดียวกัน
  // ไม่งั้นแถบยาวสุดจะไม่ใช่ขาที่ทำเงินมากสุดของเดือน
  const legs = snapshot.legs
    .map((leg) => ({ leg, profit: legProfitIn(leg, month) }))
    .sort((a, b) => b.profit - a.profit);
  const widest = Math.max(1, ...legs.map((l) => Math.abs(l.profit)));

  const rows: LineMessage[] = [];
  legs.forEach(({ leg, profit }, i) => {
    if (i > 0) rows.push(separator("xs"));
    const share = Math.max(1, Math.round((Math.abs(profit) / widest) * 50));
    // แถบยิงจากกลางออกไป — ขวา = บวก · ซ้าย = ลบ (อ่านออกโดยไม่ต้องแยกสี)
    const fill = { type: "box", layout: "vertical", flex: share, backgroundColor: profit >= 0 ? UP : DOWN, contents: [{ type: "filler" }] };
    const rest = { type: "filler", flex: Math.max(1, 50 - share) };
    const half = { type: "filler", flex: 50 };
    const bar: LineMessage = {
      type: "box",
      layout: "horizontal",
      height: "4px",
      contents: profit >= 0 ? [half, fill, rest] : [rest, fill, half],
    };
    rows.push({
      type: "box",
      layout: "vertical",
      contents: [
        {
          type: "box",
          layout: "horizontal",
          contents: [
            text(legName(leg.name), { size: "xxs", weight: "bold", color: INK, flex: 5 }),
            text(signed(profit), { size: "xxs", weight: "bold", align: "end", color: tone(profit), flex: 3 }),
          ],
        },
        bar,
      ],
    });
  });

  const win = legs.filter((l) => l.profit >= 0).length;
  // ยอดรวมของเดือนมาจาก `monthly[].profit` (เส้นทุนของทั้งพอร์ต) ไม่ใช่บวกรายขาเอง
  // — ที่มาเดียวกับกราฟบนเว็บ ⇒ เลขตรงกันเสมอ
  const total = month ? month.profit : snapshot.kpi.profit;
  rows.push(
    tally("รวมทุกขา", signed(total), tone(total),
      `ทั้งปี ${signed(snapshot.kpi.profit)} · แถบไปทางขวา = บวก · ไปทางซ้าย = ลบ · เรียงจากทำเงินมากสุดลงมา`),
  );

  return bubble({
    kicker: month ? monthLabel : `ปี 25${snapshot.testYears[0] ?? ""} · ทั้งปี`,
    title: "ขาไหนบวก ขาไหนลบ",
    when: `บวก ${win} ขา · ลบ ${legs.length - win} ขา`,
    body: rows,
    footer: buttons,
  });
}

/* ─────────────────────────── ประกอบทั้งชุด ─────────────────────────── */


export interface CardInput {
  report: DayReport;
  /** หวยที่เพิ่งกรอก */
  lottery: string;
  month: MonthTable | null;
  snapshot: PortfolioSnapshot | null;
  appUrl: string;
  /** true = ส่งซ้ำเพราะแก้ผลที่กรอกผิด — หัวการ์ดต้องบอกให้ชัด */
  corrected?: boolean;
}

/** ตัดวันเก่าออกจนกว่าจะไม่เกินเพดาน — คืน null ถ้าตัดจนหมดก็ยังไม่พอ */
function fitMonth(month: MonthTable): LineMessage | null {
  for (const maxDays of [31, 24, 18, 12, 8]) {
    const bubble = monthBubble(month, maxDays);
    if (!bubble) return null;
    if (jsonBytes(bubble) <= MAX_JSON_BYTES) return bubble;
  }
  return null;
}


/**
 * คืน **ข้อความ 1-2 ก้อน** (push ทีเดียวได้ LINE รับได้ 5 ก้อนต่อครั้ง):
 *   [0] carousel ของผลงวดนี้/วันนี้/พอร์ต/รายขา
 *   [1] ตารางรายวันของเดือน — **แยกก้อน** เพราะเพดาน 30 KB เป็นของ *แต่ละข้อความ*
 *
 * ⚠️ เคยยัดตารางไว้ใน carousel เดียวกันแล้วมันโดนตัดเหลือ 12-18 วันทุกครั้ง
 * (วัดจริงด้วย `scripts/card-preview.ts`: ตารางเต็มเดือน ~13 KB + ใบอื่นอีก ~15 KB = เกิน)
 * แยกก้อนแล้วได้ครบทั้งเดือนโดยไม่ต้องตัดอะไรทิ้ง
 */
export function buildDrawCard(input: CardInput): LineMessage[] {
  const { report, lottery, month, snapshot, appUrl } = input;
  const group = report.lotteries.find((l) => l.lottery === lottery);
  const seq = report.lotteries.filter((l) => !l.untouched).findIndex((l) => l.lottery === lottery) + 1;
  const monthLabel = `${TH_MONTHS[report.date.getUTCMonth() + 1]} ${report.date.getUTCFullYear() + 543}`;

  const buttons = [
    linkButton("กรอกหวยตัวถัดไป", `${appUrl}/draws`, true),
    linkButton("เปิดหน้าพอร์ต", `${appUrl}/portfolio`, false),
  ];

  const bubbles: LineMessage[] = [];
  const first = drawBubble(report, lottery, Math.max(1, seq), month, monthLabel, input.corrected ?? false);
  if (first) bubbles.push(first);
  const day = dayBubble(report);
  if (day) bubbles.push(day);
  /*
   * ภาพรวมพอร์ต + รายขา โผล่เฉพาะ **หวยตัวสุดท้ายของวัน** เท่านั้น
   *
   * ระหว่างวันคำถามคือ "งวดนี้เป็นไง · วันนี้ถึงตอนนี้เท่าไหร่" ภาพรวมทั้งพอร์ตยัง
   * ไม่เปลี่ยนพอให้ดูทุกรอบ · และใบรายขา (9 ขา) เป็นใบที่สูงที่สุด — carousel ของ LINE
   * บังคับให้ทุกใบสูงเท่ากัน ⇒ มันลากใบสั้น ๆ ให้โล่งตามไปด้วยทุกครั้ง
   * (กติกาเดียวกับฝั่ง Python: เวลาช้าสุดของพอร์ต = ส่งรายงานรวมทั้งพอร์ต)
   *
   * `allDone` เผื่อกรอกข้ามลำดับ — กรอกครบทุกหวยของวันแล้วก็ควรได้สรุปเหมือนกัน
   */
  const last = report.lotteries[report.lotteries.length - 1];
  const isLastOfDay = Boolean(last) && last.lottery === lottery;
  const allDone = report.totalCount > 0 && report.doneCount >= report.totalCount;
  if (snapshot && (isLastOfDay || allDone)) {
    const monthRow = monthOf(snapshot, report.date);
    bubbles.push(portfolioBubble(snapshot, monthLabel, monthRow));
    if (snapshot.legs.length > 0) bubbles.push(legsBubble(snapshot, monthLabel, monthRow, buttons));
  }
  if (bubbles.length > 0 && !bubbles.some((b) => b.footer)) {
    bubbles[bubbles.length - 1].footer = {
      type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: buttons,
    };
  }

  const head = input.corrected ? "แก้ไขผลของ " : "";
  const alt = group
    ? `${head}${group.flag} ${group.lottery}${group.time ? ` ${group.time}` : ""} ${thaiDate(report.date)} → ${signed(group.pnl)} · วันนี้รวม ${signed(report.pnl)}`
    : `${head}ผลหวย ${thaiDate(report.date)} · วันนี้รวม ${signed(report.pnl)}`;

  const messages: LineMessage[] = [];
  if (bubbles.length > 0) messages.push(flex(alt, bubbles.slice(0, 12)));

  const table = month ? fitMonth(month) : null;
  if (table) {
    messages.push(
      flex(
        `${shortLottery(month!.lottery)} รายวัน ${TH_MONTHS[month!.month]} 25${month!.yearBe} → ${signed(month!.pnl)}`,
        [table],
      ),
    );
  }
  return messages;
}
