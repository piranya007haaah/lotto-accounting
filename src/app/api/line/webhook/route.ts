import { NextResponse } from "next/server";
import { adminLineUserIds, APP_TIMEZONE, appUrl } from "@/lib/env";
import { route } from "@/lib/http";
import {
  HELP_TEXT,
  isMessagingConfigured,
  replyMessage,
  summaryFlex,
  textMessage,
  verifyLineSignature,
} from "@/lib/line";
import { resolveRange } from "@/lib/range";
import { getSummary } from "@/lib/summary";
import { supabaseAdmin } from "@/lib/supabase";
import { currentMonthKey, normalizeEraYear, pad2 } from "@/lib/thai-date";
import type { SummaryBucket } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface LineEvent {
  type: string;
  replyToken?: string;
  source?: { type?: string; userId?: string; groupId?: string; roomId?: string };
  message?: { type: string; text?: string };
}

/**
 * ปลายทางของข้อความนี้ — ค่าเดียวกับที่ต้องใส่ใน `LINE_REPORT_TO`
 * (กลุ่มใช้ `groupId` · ห้องใช้ `roomId` · แชท 1:1 ใช้ `userId`)
 */
function sourceId(source: LineEvent["source"]): { id: string; kind: string } | null {
  if (source?.groupId) return { id: source.groupId, kind: "กลุ่ม" };
  if (source?.roomId) return { id: source.roomId, kind: "ห้องแชท" };
  if (source?.userId) return { id: source.userId, kind: "แชท 1:1" };
  return null;
}

/** แปลงข้อความที่พิมพ์มาเป็น query สำหรับ resolveRange */
function commandToParams(rawText: string): { params: URLSearchParams; mode: "site" | "day" } | null {
  const text = rawText.trim().toLowerCase();
  const params = new URLSearchParams();

  if (["สรุป", "วันนี้", "today", "สรุปวันนี้"].includes(text)) {
    params.set("range", "today");
    return { params, mode: "site" };
  }
  if (["เมื่อวาน", "yesterday", "สรุปเมื่อวาน"].includes(text)) {
    params.set("range", "yesterday");
    return { params, mode: "site" };
  }
  if (["เดือนนี้", "สรุปเดือน", "สรุปเดือนนี้", "month"].includes(text)) {
    params.set("month", currentMonthKey(APP_TIMEZONE));
    return { params, mode: "site" };
  }
  if (["รายวัน", "สรุปรายวัน", "daily"].includes(text)) {
    params.set("month", currentMonthKey(APP_TIMEZONE));
    return { params, mode: "day" };
  }
  if (["เว็บ", "แยกเว็บ", "ตามเว็บ", "site"].includes(text)) {
    params.set("month", currentMonthKey(APP_TIMEZONE));
    return { params, mode: "site" };
  }
  if (["7 วัน", "7วัน", "last7", "อาทิตย์นี้"].includes(text)) {
    params.set("range", "last7");
    return { params, mode: "day" };
  }
  if (["30 วัน", "30วัน", "last30"].includes(text)) {
    params.set("range", "last30");
    return { params, mode: "day" };
  }

  // "08/2569" หรือ "8/2026"
  const slash = text.match(/^(\d{1,2})[/-](\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const year = normalizeEraYear(Number(slash[2]));
    if (month >= 1 && month <= 12) {
      params.set("month", `${year}-${pad2(month)}`);
      return { params, mode: "site" };
    }
  }

  // "2026-08"
  const iso = text.match(/^(\d{4})-(\d{1,2})$/);
  if (iso) {
    const year = normalizeEraYear(Number(iso[1]));
    const month = Number(iso[2]);
    if (month >= 1 && month <= 12) {
      params.set("month", `${year}-${pad2(month)}`);
      return { params, mode: "site" };
    }
  }

  return null;
}

async function findUserByLineId(lineUserId: string) {
  const { data } = await supabaseAdmin()
    .from("app_users")
    .select("id, is_active")
    .eq("line_user_id", lineUserId)
    .maybeSingle();
  return data;
}

async function handleEvent(event: LineEvent): Promise<void> {
  const replyToken = event.replyToken;
  if (!replyToken) return;

  if (event.type === "follow") {
    await replyMessage(replyToken, [
      textMessage(`ยินดีต้อนรับ 🎉\n\nกดปุ่มด้านล่างเพื่อเปิดหน้าบันทึกรายการ แล้วเลือกเว็บ + อัปโหลดรูปสลิปได้เลย\n${appUrl()}\n\n${HELP_TEXT}`),
    ]);
    return;
  }

  if (event.type !== "message") return;

  if (event.message?.type === "image") {
    await replyMessage(replyToken, [
      textMessage(`ระบบรับรูปผ่านหน้าฟอร์มเท่านั้น เพื่อให้เลือกเว็บได้ถูกต้อง\nเปิดที่นี่ 👉 ${appUrl()}`),
    ]);
    return;
  }

  if (event.message?.type !== "text") return;

  const lineUserId = event.source?.userId;

  /* ── `/id` — บอกว่าห้องนี้มี id อะไร เอาไปใส่ `LINE_REPORT_TO` ได้เลย ──
   * ต้องตอบ **ก่อน** เช็คสมาชิก เพราะพิมพ์ในกลุ่มซึ่งคนพิมพ์อาจยังไม่เคยล็อกอินแอปนี้
   * ⚠️ จำกัดเฉพาะผู้ดูแล (`LINE_ADMIN_USER_IDS`) — id ของกลุ่มเอาไปทำอะไรไม่ได้ถ้าไม่มี
   *    token อยู่แล้ว แต่ไม่มีเหตุผลให้ใครก็ได้ในกลุ่มดึงออกไป · ไม่ได้ตั้ง env = ปิดคำสั่งนี้
   */
  if ((event.message.text ?? "").trim().toLowerCase() === "/id") {
    const admins = adminLineUserIds();
    const where = sourceId(event.source);
    if (admins.length > 0 && lineUserId && admins.includes(lineUserId) && where) {
      await replyMessage(replyToken, [
        textMessage(
          `${where.kind}นี้คือ\n${where.id}\n\n` +
            "เอาไปใส่ LINE_REPORT_TO ที่ Vercel → Settings → Environment Variables\n" +
            "แล้ว Redeploy หนึ่งครั้ง (env ใหม่ไม่มีผลจนกว่าจะ deploy ใหม่)",
        ),
      ]);
    }
    return;
  }

  if (!lineUserId) return;

  const command = commandToParams(event.message.text ?? "");
  if (!command) {
    await replyMessage(replyToken, [textMessage(HELP_TEXT)]);
    return;
  }

  const user = await findUserByLineId(lineUserId);
  if (!user || !user.is_active) {
    await replyMessage(replyToken, [
      textMessage(`ยังไม่พบข้อมูลของคุณในระบบ\nเปิดหน้าบันทึกและเข้าสู่ระบบด้วย LINE ก่อนหนึ่งครั้ง 👉 ${appUrl()}`),
    ]);
    return;
  }

  const { from, to, label } = resolveRange(command.params, APP_TIMEZONE);
  const summary = await getSummary({ ownerId: user.id as string, from, to });

  const rows: SummaryBucket[] =
    command.mode === "day" ? summary.byDay.slice(-12) : summary.bySite;

  await replyMessage(replyToken, [
    summaryFlex({
      title: `สรุปยอด ${label}`,
      subtitle: command.mode === "day" ? "แยกตามวัน" : "แยกตามเว็บ",
      rows,
      totals: summary.totals,
    }),
  ]);
}

export const POST = route(async (request) => {
  const rawBody = await request.text();

  if (!isMessagingConfigured()) {
    console.warn("[line] ยังไม่ได้ตั้งค่า Messaging API — ข้าม webhook");
    return NextResponse.json({ ok: true });
  }

  if (!verifyLineSignature(rawBody, request.headers.get("x-line-signature"))) {
    return NextResponse.json({ error: "ลายเซ็นไม่ถูกต้อง" }, { status: 401 });
  }

  const body = JSON.parse(rawBody || "{}") as { events?: LineEvent[] };
  for (const event of body.events ?? []) {
    try {
      await handleEvent(event);
    } catch (error) {
      console.error("[line] จัดการ event ไม่สำเร็จ:", error);
    }
  }

  // LINE ต้องการ 200 เสมอ ไม่งั้นจะ retry ซ้ำ
  return NextResponse.json({ ok: true });
});
