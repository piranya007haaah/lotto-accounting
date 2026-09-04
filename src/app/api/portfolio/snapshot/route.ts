/**
 * POST  รับ snapshot ของพอร์ตจากแอป Streamlit (lottery-app) — ยืนยันด้วย shared secret
 * GET   อ่าน snapshot ให้หน้าเว็บ — **ผู้ดูแลเท่านั้น** (ตัวเลขพอร์ตเป็นเงินของเจ้าของคนเดียว
 *       ไม่ใช่ข้อมูลร่วมแบบรายชื่อเว็บ)
 */

import { requireAdmin } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { readJsonBody, requireIngestSecret } from "@/lib/ingest-auth";
import {
  fromRow,
  SUPPORTED_SNAPSHOT_VERSION,
  snapshotPayloadSchema,
  toStored,
} from "@/lib/portfolio-snapshot";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "portfolio_snapshots";
/** 1 พอร์ต ~40 KB (เส้นทุน + เส้นรายขา + เลขที่แทง) — 2 MB เผื่อไว้เยอะแล้ว */
const MAX_BODY_BYTES = 2 * 1024 * 1024;

export const POST = route(async (request) => {
  requireIngestSecret(request);

  const parsed = snapshotPayloadSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(
      400,
      `snapshot ผิดรูปแบบ: ${first?.path.join(".")} — ${first?.message}`,
      "bad_payload",
    );
  }

  const payload = parsed.data;
  if (payload.version > SUPPORTED_SNAPSHOT_VERSION) {
    throw new HttpError(
      409,
      `snapshot เวอร์ชัน ${payload.version} ใหม่กว่าที่แอปนี้รองรับ (${SUPPORTED_SNAPSHOT_VERSION}) — อัปเดตแอปบัญชีก่อน`,
      "version_too_new",
    );
  }

  const { error } = await supabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        portfolio_id: payload.portfolio.id,
        name: payload.portfolio.name,
        is_active: payload.portfolio.is_active,
        version: payload.version,
        generated_at: payload.generated_at,
        received_at: new Date().toISOString(),
        payload: toStored(payload),
      },
      { onConflict: "portfolio_id" },
    );

  if (error) {
    throw new HttpError(500, `บันทึก snapshot ไม่สำเร็จ: ${error.message}`);
  }

  return ok({
    saved: true,
    portfolioId: payload.portfolio.id,
    name: payload.portfolio.name,
    legs: payload.legs.length,
  });
});

export const GET = route(async (request) => {
  await requireAdmin(request);

  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select("portfolio_id, name, is_active, version, generated_at, received_at, payload")
    // พอร์ต "ใช้จริง" ขึ้นก่อน แล้วเรียงตามความสด (กติกาเดียวกับฝั่ง lottery-app)
    .order("is_active", { ascending: false })
    .order("generated_at", { ascending: false });

  if (error) {
    throw new HttpError(500, `อ่าน snapshot ไม่สำเร็จ: ${error.message}`);
  }

  const rows = (data ?? []).map(fromRow);
  const wanted = new URL(request.url).searchParams.get("id");
  const selected = wanted
    ? (rows.find((row) => String(row.portfolioId) === wanted) ?? null)
    : (rows[0] ?? null);

  return ok({
    // รายชื่อไว้ทำตัวเลือกด้านบนหน้า — ไม่ต้องส่ง payload ของทุกพอร์ตมาให้หนัก
    portfolios: rows.map((row) => ({
      portfolioId: row.portfolioId,
      name: row.name,
      isActive: row.isActive,
      generatedAt: row.generatedAt,
    })),
    snapshot: selected,
  });
});
