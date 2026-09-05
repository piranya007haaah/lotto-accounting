/**
 * ชิ้นส่วน Flex ที่การ์ดทุกใบใช้ร่วมกัน — สี · ตัวจัดรูปตัวเลข · กล่องพื้นฐาน
 *
 * แยกออกมาเพราะมีการ์ด 2 ชนิดแล้ว (ผลหวยรายวัน · รายงานสูตร) และจะมีอีก —
 * ก๊อปชิ้นส่วนไปคนละไฟล์เมื่อไหร่ หน้าตาการ์ดจะเริ่มไม่เหมือนกันทีละนิดโดยไม่มีใครสังเกต
 *
 * ⚠️ เพดาน 30 KB ของ LINE เป็นของ **แต่ละข้อความ** — ทุกคีย์ที่ตัดได้ในกล่องที่ซ้ำ
 * ร้อยกว่าครั้งคูณด้วยจำนวนนั้น · วัดด้วย `jsonBytes` (ไบต์จริง) ไม่ใช่ `.length`
 */

import type { LineMessage } from "@/lib/line";

export const INK = "#1f2937";
export const DIM = "#8a95a5";
export const LINE_COLOR = "#eceff3";
export const HEAD_BG = "#23385c";
export const HEAD_INK = "#ffffff";
export const TINT = "#f4f7fb";
export const UP = "#0f9d63";
export const DOWN = "#d93a3f";

/**
 * เพดานของ LINE คือ JSON 30 KB ต่อข้อความ Flex — เกินแล้วมันปฏิเสธทั้งข้อความ
 *
 * ⚠️ ตั้งเผื่อไว้มากเกินไปก็เจ็บ: เคยตั้ง 22,000 แล้วตารางรายเดือน 31 แถวไม่เคยผ่าน
 * สักรอบ ⇒ `fitCarousel` ไล่ลดวันจนเหลือ 0 แล้ว **ตัดทั้งใบทิ้ง** โดยหน้าจอไม่ฟ้องอะไร
 * (จับได้ตอนรัน `scripts/card-preview.ts` กับข้อมูลจริง)
 */
export const MAX_JSON_BYTES = 29_000;

/** ขนาดจริงเป็นไบต์ — `.length` นับ UTF-16 ซึ่งภาษาไทยจะน้อยกว่าไบต์จริงราว 2 เท่า */
export function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

export const TH_MONTHS = [
  "", "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

export function baht(n: number): string {
  return Math.round(n).toLocaleString("th-TH");
}
export function signed(n: number): string {
  return (n >= 0 ? "+" : "−") + baht(Math.abs(n));
}
export function tone(n: number): string {
  return n >= 0 ? UP : DOWN;
}
export function thaiDate(date: Date): string {
  return `${date.getUTCDate()} ${TH_MONTHS[date.getUTCMonth() + 1]} ${date.getUTCFullYear() + 543}`;
}
export function shortLottery(name: string): string {
  return name.replace(/^หวย/, "").replace(/^หุ้น/, "");
}
export function shortPosition(position: string): string {
  if (position.includes("สาม")) return "3 บน";
  if (position.includes("ล่าง")) return "2 ล่าง";
  if (position.includes("สอง")) return "2 บน";
  return position;
}

/* ─────────────────────────── ชิ้นส่วน Flex ─────────────────────────── */

export function text(value: string, opts: Record<string, unknown> = {}): LineMessage {
  // ไม่ใส่ `wrap: false` เพราะเป็นค่าเริ่มต้นของ LINE อยู่แล้ว — ตารางเต็มเดือนมีร้อยกว่า
  // ช่อง คีย์ที่ไม่จำเป็นคีย์เดียวก็กินพื้นที่พอให้ตารางโดนตัดวันทิ้ง
  return { type: "text", text: value, ...opts };
}

/** แถว "ป้ายซ้าย · ตัวเลขขวา" — ใช้ทุกใบ */
export function statRow(label: LineMessage[], value: string, color = INK): LineMessage {
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

export function separator(margin = "md"): LineMessage {
  return { type: "separator", margin, color: LINE_COLOR };
}

/** กล่องสรุปพื้นเทาท้ายการ์ด */
export function tally(label: string, value: string, color: string, foot?: string): LineMessage {
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

/**
 * ตัวดันเนื้อหาที่เหลือลงล่าง — วางก่อนกล่องสรุปท้ายใบ
 *
 * ⚠️ carousel ของ LINE **บังคับให้ทุกใบสูงเท่าใบที่สูงที่สุด** (แก้ไม่ได้) ⇒ ใบที่มี
 * เนื้อหาน้อย เช่นหวยที่มีตำแหน่งเดียว จะเหลือที่ว่างครึ่งใบ · filler ทำให้ที่ว่าง
 * ไปกองตรงกลาง แล้วยอดรวมไปเกาะขอบล่าง = ดูเหมือนตั้งใจ ไม่ใช่เนื้อหาขาด
 * · ใบที่สูงอยู่แล้ว filler จะกว้าง 0 ไม่มีผลอะไร
 */
export function filler(): LineMessage {
  return { type: "filler" };
}

export function bubble(options: {
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
  // ⚠️ `[]` เป็น truthy ใน JS — เช็คความยาวด้วย ไม่งั้นได้กล่อง footer เปล่า ๆ
  //    ที่กินที่ท้ายใบโดยไม่มีอะไรอยู่ข้างใน (เจอจริงตอนส่ง `[]` มาแทน undefined)
  if (options.footer && options.footer.length > 0) {
    node.footer = { type: "box", layout: "vertical", spacing: "sm", paddingAll: "14px", contents: options.footer };
  }
  return node;
}


export function linkButton(label: string, url: string, primary: boolean): LineMessage {
  return {
    type: "button",
    style: primary ? "primary" : "link",
    height: "sm",
    color: primary ? HEAD_BG : undefined,
    action: { type: "uri", label: label.slice(0, 20), uri: url },
  };
}

export function flex(altText: string, bubbles: LineMessage[]): LineMessage {
  return {
    type: "flex",
    altText: altText.slice(0, 390),
    contents: bubbles.length === 1 ? bubbles[0] : { type: "carousel", contents: bubbles },
  };
}
