import crypto from "node:crypto";
import { appUrl, env } from "./env";
import { formatBahtShort, formatSigned } from "./format";
import type { SummaryBucket } from "./types";

const LINE_API = "https://api.line.me/v2/bot";

export function isMessagingConfigured(): boolean {
  return Boolean(env("LINE_MESSAGING_CHANNEL_SECRET") && env("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN"));
}

/** ตรวจลายเซ็น webhook ของ LINE (HMAC-SHA256 + base64) */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = env("LINE_MESSAGING_CHANNEL_SECRET");
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export interface LineMessage {
  type: string;
  [key: string]: unknown;
}

export function textMessage(text: string): LineMessage {
  return { type: "text", text: text.slice(0, 4900) };
}

async function callLineApi(path: string, payload: unknown): Promise<void> {
  const accessToken = env("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
  if (!accessToken) return;
  const response = await fetch(`${LINE_API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error(`[line] ${path} ล้มเหลว ${response.status}: ${detail}`);
  }
}

export function replyMessage(replyToken: string, messages: LineMessage[]) {
  return callLineApi("/message/reply", { replyToken, messages: messages.slice(0, 5) });
}

export function pushMessage(to: string, messages: LineMessage[]) {
  return callLineApi("/message/push", { to, messages: messages.slice(0, 5) });
}

/**
 * push ที่ **บอกผลกลับมา** — ต่างจาก `pushMessage` ที่กลืน error แล้ว log เฉย ๆ
 *
 * ใช้ตอนที่หน้าจอต้องรายงานให้คนกรอกรู้ว่าการ์ดเข้า LINE จริงไหม
 * ⚠️ ห้ามใช้ `pushMessage` แทน แล้วเดาว่า "ไม่ throw = ส่งสำเร็จ" — มันไม่ throw อยู่แล้ว
 * จะกลายเป็นขึ้นว่าส่งแล้วทั้งที่ LINE ปฏิเสธไปตั้งแต่ต้น
 */
export async function pushMessageResult(
  to: string,
  messages: LineMessage[],
): Promise<{ ok: boolean; error: string | null }> {
  const accessToken = env("LINE_MESSAGING_CHANNEL_ACCESS_TOKEN");
  if (!accessToken) return { ok: false, error: "ยังไม่ได้ตั้ง LINE_MESSAGING_CHANNEL_ACCESS_TOKEN" };
  try {
    const response = await fetch(`${LINE_API}/message/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ to, messages: messages.slice(0, 5) }),
    });
    if (response.ok) return { ok: true, error: null };
    const detail = await response.text().catch(() => "");
    return { ok: false, error: `LINE ตอบ ${response.status}: ${detail.slice(0, 300)}` };
  } catch (caught) {
    return { ok: false, error: `ส่งไม่สำเร็จ: ${(caught as Error).message}` };
  }
}

function row(label: string, value: string, color = "#111827", bold = false): LineMessage {
  return {
    type: "box",
    layout: "horizontal",
    contents: [
      { type: "text", text: label, size: "sm", color: "#6b7280", flex: 5, wrap: true },
      {
        type: "text",
        text: value,
        size: "sm",
        color,
        flex: 4,
        align: "end",
        weight: bold ? "bold" : "regular",
      },
    ],
  };
}

/** การ์ดสรุปยอดสำหรับส่งกลับในแชท */
export function summaryFlex(params: {
  title: string;
  subtitle: string;
  rows: SummaryBucket[];
  totals: { deposit: number; withdraw: number; net: number; count: number };
}): LineMessage {
  const detailRows: LineMessage[] = params.rows.slice(0, 12).map((bucket) =>
    row(bucket.label, `${formatBahtShort(bucket.deposit)} / ${formatBahtShort(bucket.withdraw)}`),
  );

  const body: LineMessage[] = [
    { type: "text", text: params.title, weight: "bold", size: "lg", wrap: true },
    { type: "text", text: params.subtitle, size: "xs", color: "#9ca3af", wrap: true },
    { type: "separator", margin: "md" },
  ];

  if (detailRows.length > 0) {
    body.push({
      type: "box",
      layout: "vertical",
      margin: "md",
      spacing: "sm",
      contents: [row("รายการ", "เข้าเว็บ / ออกจากเว็บ"), ...detailRows],
    });
    body.push({ type: "separator", margin: "md" });
  } else {
    body.push({
      type: "text",
      text: "ยังไม่มีรายการในช่วงนี้",
      size: "sm",
      color: "#9ca3af",
      margin: "md",
    });
  }

  body.push({
    type: "box",
    layout: "vertical",
    margin: "md",
    spacing: "sm",
    contents: [
      row("รวมเงินเข้าเว็บ", `${formatBahtShort(params.totals.deposit)} ฿`, "#dc2626", true),
      row("รวมเงินออกจากเว็บ", `${formatBahtShort(params.totals.withdraw)} ฿`, "#059669", true),
      row(
        "กำไร/ขาดทุน",
        `${formatSigned(params.totals.net)} ฿`,
        params.totals.net >= 0 ? "#059669" : "#dc2626",
        true,
      ),
      row("จำนวนรายการ", `${params.totals.count}`),
    ],
  });

  return {
    type: "flex",
    altText: `${params.title} — เข้า ${formatBahtShort(params.totals.deposit)} / ออก ${formatBahtShort(params.totals.withdraw)}`,
    contents: {
      type: "bubble",
      body: { type: "box", layout: "vertical", spacing: "xs", contents: body },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            style: "primary",
            height: "sm",
            action: { type: "uri", label: "เปิดหน้าบันทึก", uri: appUrl() },
          },
        ],
      },
    },
  };
}

export const HELP_TEXT = `คำสั่งที่ใช้ได้
• สรุป หรือ วันนี้ — ยอดของวันนี้
• เมื่อวาน — ยอดของเมื่อวาน
• เดือนนี้ — ยอดรวมรายวันของเดือนนี้
• 08/2569 หรือ 2026-08 — ยอดของเดือนที่ระบุ
• เว็บ — แยกยอดตามเว็บของเดือนนี้

การบันทึกรายการให้กดเมนู เปิดหน้าบันทึก แล้วเลือกเว็บ + อัปโหลดรูปสลิป`;
