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
import type { PortfolioSnapshot } from "@/lib/types";
import type { DayReport, MonthTable } from "./day-result";

const INK = "#1f2937";
const DIM = "#8a95a5";
const LINE_COLOR = "#eceff3";
const HEAD_BG = "#23385c";
const HEAD_INK = "#ffffff";
const TINT = "#f4f7fb";
const UP = "#0f9d63";
const DOWN = "#d93a3f";
const UP_SOFT = "#e2f5ec";

/**
 * เพดานของ LINE คือ JSON 30 KB ต่อข้อความ Flex — เกินแล้วมันปฏิเสธทั้งข้อความ
 *
 * ⚠️ ตั้งเผื่อไว้มากเกินไปก็เจ็บ: เคยตั้ง 22,000 แล้วตารางรายเดือน 31 แถวไม่เคยผ่าน
 * สักรอบ ⇒ `fitCarousel` ไล่ลดวันจนเหลือ 0 แล้ว **ตัดทั้งใบทิ้ง** โดยหน้าจอไม่ฟ้องอะไร
 * (จับได้ตอนรัน `scripts/card-preview.ts` กับข้อมูลจริง)
 */
const MAX_JSON_BYTES = 29_000;

/** ขนาดจริงเป็นไบต์ — `.length` นับ UTF-16 ซึ่งภาษาไทยจะน้อยกว่าไบต์จริงราว 2 เท่า */
function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

const TH_MONTHS = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function baht(n: number): string {
  return Math.round(n).toLocaleString("th-TH");
}
export function signed(n: number): string {
  return (n >= 0 ? "+" : "−") + baht(Math.abs(n));
}
function tone(n: number): string {
  return n >= 0 ? UP : DOWN;
}
export function thaiDate(date: Date): string {
  return `${date.getUTCDate()} ${TH_MONTHS[date.getUTCMonth() + 1]} ${date.getUTCFullYear() + 543}`;
}
function shortLottery(name: string): string {
  return name.replace(/^หวย/, "").replace(/^หุ้น/, "");
}
function shortPosition(position: string): string {
  if (position.includes("สาม")) return "3 บน";
  if (position.includes("ล่าง")) return "2 ล่าง";
  if (position.includes("สอง")) return "2 บน";
  return position;
}

/* ─────────────────────────── ชิ้นส่วน Flex ─────────────────────────── */

function text(value: string, opts: Record<string, unknown> = {}): LineMessage {
  // ไม่ใส่ `wrap: false` เพราะเป็นค่าเริ่มต้นของ LINE อยู่แล้ว — ตารางเต็มเดือนมีร้อยกว่า
  // ช่อง คีย์ที่ไม่จำเป็นคีย์เดียวก็กินพื้นที่พอให้ตารางโดนตัดวันทิ้ง
  return { type: "text", text: value, ...opts };
}

/** แถว "ป้ายซ้าย · ตัวเลขขวา" — ใช้ทุกใบ */
function statRow(label: LineMessage[], value: string, color = INK): LineMessage {
  return {
    type: "box",
    layout: "horizontal",
    alignItems: "flex-start",
    contents: [
      { type: "box", layout: "vertical", flex: 5, contents: label },
      text(value, { flex: 4, size: "sm", weight: "bold", align: "end", color, wrap: false }),
    ],
  };
}

function separator(margin = "md"): LineMessage {
  return { type: "separator", margin, color: LINE_COLOR };
}

/** กล่องสรุปพื้นเทาท้ายการ์ด */
function tally(label: string, value: string, color: string, foot?: string): LineMessage {
  const contents: LineMessage[] = [
    {
      type: "box",
      layout: "horizontal",
      alignItems: "center",
      contents: [
        text(label, { size: "xs", color: DIM, flex: 3 }),
        text(value, { size: "lg", weight: "bold", align: "end", color, flex: 4 }),
      ],
    },
  ];
  if (foot) contents.push(text(foot, { size: "xxs", color: DIM, wrap: true, margin: "xs" }));
  return {
    type: "box",
    layout: "vertical",
    backgroundColor: TINT,
    cornerRadius: "8px",
    paddingAll: "10px",
    margin: "md",
    contents,
  };
}

function bubble(options: {
  kicker: string;
  title: string;
  when: string;
  body: LineMessage[];
  footer?: LineMessage[];
}): LineMessage {
  const node: LineMessage = {
    type: "bubble",
    size: "mega",
    header: {
      type: "box",
      layout: "vertical",
      backgroundColor: HEAD_BG,
      paddingAll: "14px",
      contents: [
        text(options.kicker, { size: "xxs", color: "#a8bad6" }),
        text(options.title, { size: "md", weight: "bold", color: HEAD_INK, wrap: true, margin: "none" }),
        text(options.when, { size: "xxs", color: "#a8bad6", margin: "xs", wrap: true }),
      ],
    },
    body: { type: "box", layout: "vertical", paddingAll: "14px", spacing: "sm", contents: options.body },
  };
  if (options.footer) {
    node.footer = { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: options.footer };
  }
  return node;
}

/* ─────────────────────────── ใบที่ 1: หวยที่เพิ่งกรอก ─────────────────────────── */

const STATUS_MARK: Record<string, string> = {
  hit: "✅",
  miss: "❌",
  "no-bet": "—",
  holiday: "—",
  pending: "—",
};

function drawBubble(report: DayReport, lottery: string, seq: number, corrected = false): LineMessage | null {
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

  // ⚠️ ตารางเต็มเดือนมี 31 แถว × 2-3 คอลัมน์ ⇒ ทุกไบต์ต่อช่องคูณเกือบร้อย
  // ช่องที่ **ไม่ถูก** จึงเป็น text เปล่า ๆ (ไม่มีกล่องห่อ ไม่ตั้งสี/น้ำหนัก ใช้ค่าเริ่มต้น)
  // เหลือกล่องเฉพาะช่องที่ **ถูก** ซึ่งต้องมีพื้นหลัง — ประหยัดไปครึ่งหนึ่งของตาราง
  // และทำให้ตารางอยู่ครบทั้งเดือนโดยไม่ชนเพดาน 30 KB ของ LINE
  const cell = (value: string, hit: boolean): LineMessage =>
    hit
      ? {
          type: "box",
          layout: "vertical",
          flex: 3,
          backgroundColor: UP_SOFT,
          cornerRadius: "4px",
          contents: [text(value, { size: "xxs", align: "center", color: UP, weight: "bold" })],
        }
      : text(value, { size: "xxs", align: "center", flex: 3 });

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
        return cell(found?.draw ?? "—", found?.status === "hit");
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
    when: "ช่องพื้นเข้ม = ถูก · ช่องจาง = ไม่ถูก",
    body,
  });
}

/* ─────────────────────── ใบที่ 4-5: ภาพรวมพอร์ต / รายขา ─────────────────────── */

function portfolioBubble(snapshot: PortfolioSnapshot, monthLabel: string): LineMessage {
  const kpi = snapshot.kpi;
  const month = snapshot.monthly.length > 0 ? snapshot.monthly[snapshot.monthly.length - 1] : null;
  const rows: LineMessage[] = [];
  const add = (title: string, sub: string, value: string, color = INK) => {
    if (rows.length > 0) rows.push(separator("sm"));
    rows.push(statRow([
      text(title, { size: "xs", weight: "bold", color: INK }),
      text(sub, { size: "xxs", color: DIM, wrap: true }),
    ], value, color));
  };

  if (month) add("กำไรเดือนล่าสุด", `เดือน ${month.label}`, signed(month.profit), tone(month.profit));
  add("กำไรปีนี้", `${kpi.roiPct >= 0 ? "+" : "−"}${Math.abs(kpi.roiPct).toFixed(1)}% ของทุน ${baht(kpi.capital)} บ.`,
    signed(kpi.profit), tone(kpi.profit));
  add("ทุนสำรองที่ควรมี", "ต้องมีเงินทนเท่านี้ถึงจะไม่ต้องเลิกกลางทาง", baht(kpi.reserveNeeded));
  add("แพ้ติดกันสูงสุด", `ลบช่วงนั้น ${signed(kpi.maxLossStreakAmount)}`, `${kpi.maxLossStreak} งวด`);

  return bubble({
    kicker: `พอร์ต ${snapshot.name} · ${snapshot.nLegs} ขา`,
    title: "ภาพรวมทั้งพอร์ต",
    when: `${monthLabel} · ข้อมูลถึง ${snapshot.asOf}`,
    body: rows,
  });
}

/** "🇻🇳 หวยฮานอยพิเศษ · สามบน (เทส 69)" → "🇻🇳 หวยฮานอยพิเศษ · สามบน" (ทั้งใบปีเดียวกัน) */
function legName(name: string): string {
  return name.replace(/\s*\(เทส\s*\d+\)\s*$/, "");
}

function legsBubble(snapshot: PortfolioSnapshot, buttons: LineMessage[]): LineMessage {
  const legs = [...snapshot.legs].sort((a, b) => b.profit - a.profit);
  const widest = Math.max(1, ...legs.map((l) => Math.abs(l.profit)));

  const rows: LineMessage[] = [];
  legs.forEach((leg, i) => {
    if (i > 0) rows.push(separator("xs"));
    const share = Math.max(1, Math.round((Math.abs(leg.profit) / widest) * 50));
    // แถบยิงจากกลางออกไป — ขวา = บวก · ซ้าย = ลบ (อ่านออกโดยไม่ต้องแยกสี)
    const fill = { type: "box", layout: "vertical", flex: share, backgroundColor: leg.profit >= 0 ? UP : DOWN, contents: [{ type: "filler" }] };
    const rest = { type: "filler", flex: Math.max(1, 50 - share) };
    const half = { type: "filler", flex: 50 };
    const bar: LineMessage = {
      type: "box",
      layout: "horizontal",
      height: "4px",
      contents: leg.profit >= 0 ? [half, fill, rest] : [rest, fill, half],
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
            text(signed(leg.profit), { size: "xxs", weight: "bold", align: "end", color: tone(leg.profit), flex: 3 }),
          ],
        },
        bar,
      ],
    });
  });

  const win = legs.filter((l) => l.profit >= 0).length;
  rows.push(
    tally("รวมทุกขา", signed(snapshot.kpi.profit), tone(snapshot.kpi.profit),
      "แถบไปทางขวา = บวก · ไปทางซ้าย = ลบ · เรียงจากทำเงินมากสุดลงมา"),
  );

  return bubble({
    kicker: `ปี 25${snapshot.testYears[0] ?? ""} · ทั้งปี`,
    title: "ขาไหนบวก ขาไหนลบ",
    when: `บวก ${win} ขา · ลบ ${legs.length - win} ขา`,
    body: rows,
    footer: buttons,
  });
}

/* ─────────────────────────── ประกอบทั้งชุด ─────────────────────────── */

function linkButton(label: string, url: string, primary: boolean): LineMessage {
  return {
    type: "button",
    style: primary ? "primary" : "link",
    height: "sm",
    color: primary ? HEAD_BG : undefined,
    action: { type: "uri", label: label.slice(0, 20), uri: url },
  };
}

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

function flex(altText: string, bubbles: LineMessage[]): LineMessage {
  return {
    type: "flex",
    altText: altText.slice(0, 390),
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
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
  const first = drawBubble(report, lottery, Math.max(1, seq), input.corrected ?? false);
  if (first) bubbles.push(first);
  const day = dayBubble(report);
  if (day) bubbles.push(day);
  if (snapshot) {
    bubbles.push(portfolioBubble(snapshot, monthLabel));
    if (snapshot.legs.length > 0) bubbles.push(legsBubble(snapshot, buttons));
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
