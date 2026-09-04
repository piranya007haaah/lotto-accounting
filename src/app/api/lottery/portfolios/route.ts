/**
 * ตั้งค่าพอร์ตหวย (ตาราง `lottery_portfolios`) — คนละเรื่องกับ `/api/portfolio/snapshot`
 *
 *   snapshot = **ผลที่ Python คำนวณแล้ว** (แอปนี้อ่านอย่างเดียว)
 *   ตัวนี้    = **ตัวตั้งค่าพอร์ต** (legs/ทุน/เงินแทง) ที่แก้ได้จากหน้าเว็บของแอปนี้
 *
 * POST — นำเข้าจากแอป Streamlit ครั้งแรก (shared secret เหมือนท่อผลหวย)
 *        ⚠️⚠️ ดีฟอลต์ **"มีอยู่แล้วให้ข้าม"** ไม่ทับ — หลังนำเข้าครั้งแรกตารางนี้เป็นเจ้าของ
 *        ข้อมูล คนแก้พอร์ตคือหน้าเว็บ ถ้า sync รอบหน้าทับกลับ = สิ่งที่เพิ่งแก้หายเงียบ ๆ
 *        (สั่งทับได้ด้วย `replace: true` จากฝั่งโน้นเท่านั้น)
 * GET  — คนที่มีสิทธิ์ดูหน้าหวยอ่านได้ทั้งหมด · **หรือ** สคริปต์ที่ถือ shared secret
 *        (รายงาน LINE ฝั่ง Python ยังต้องอ่านพอร์ต — `src/portfolio_store.py` ของรีโปโน้น)
 * PUT  — ผู้ดูแลบันทึกพอร์ตเดียว (หน้าเว็บเรียกตัวนี้)
 */

import { requireAdmin, requireLotteryViewer } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { INGEST_SECRET_HEADER, readJsonBody, requireIngestSecret } from "@/lib/ingest-auth";
import {
  isActiveConfig,
  portfolioPayloadSchema,
  portfolioSavePayloadSchema,
  type PortfolioConfig,
} from "@/lib/lottery/portfolio-config";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "lottery_portfolios";
const MIGRATION = "supabase/migrations/0011_lottery_portfolios.sql";
/** พอร์ตที่ใหญ่สุดตอนนี้ ~48 KB (ขา 3 ตัวมีเลข 750 ตัว/เดือน) — 4 MB คือเผื่อไว้เยอะแล้ว */
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const COLUMNS = "id, name, source, capital, config, is_active, updated_at";

type PortfolioRow = {
  id: number;
  name: string;
  source: string | null;
  capital: number;
  config: PortfolioConfig;
  is_active: boolean;
  updated_at: string;
};

/**
 * ยังไม่ได้รัน migration 0011 = ยังไม่มีตารางนี้
 * PostgREST ตอบ PGRST205 (หาไม่เจอใน schema cache) · Postgres ตรง ๆ ตอบ 42P01
 */
function isMissingTableError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  if (error.code === "42P01" || error.code === "PGRST205") return true;
  // เผื่อเวอร์ชันที่ไม่ใส่ code มาให้ — ดูจากข้อความว่าพูดถึงตารางนี้
  const message = error.message ?? "";
  return message.includes(TABLE) && /schema cache|does not exist|ไม่พบ/i.test(message);
}

/** บอกตรง ๆ ว่าติด migration ไหน ดีกว่าปล่อยเป็น 500 เปล่า ๆ แล้วไปงมเอง */
function missingMigration(action: string): HttpError {
  return new HttpError(
    503,
    `${action}ไม่ได้ — ฐานข้อมูลยังไม่ได้รัน ${MIGRATION}`,
    "missing_migration",
  );
}

export const POST = route(async (request) => {
  requireIngestSecret(request);

  const parsed = portfolioPayloadSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(
      400,
      `ข้อมูลผิดรูปแบบ: ${first?.path.join(".")} — ${first?.message}`,
      "bad_payload",
    );
  }

  const { portfolios, replace } = parsed.data;
  const supabase = supabaseAdmin();

  // อ่าน id ที่มีอยู่ก่อน เพื่อ "มีแล้วข้าม" — ทำที่นี่ไม่ใช่พึ่ง onConflict ignore
  // เพราะต้องรายงานกลับให้ฝั่งโน้นเห็นว่าข้ามอะไรไปบ้าง
  const { data: existingRows, error: readError } = await supabase.from(TABLE).select("id");
  if (isMissingTableError(readError)) throw missingMigration("นำเข้าพอร์ต");
  if (readError) throw new HttpError(500, `อ่านรายชื่อพอร์ตไม่สำเร็จ: ${readError.message}`);

  const existing = new Set((existingRows ?? []).map((row) => Number((row as { id: number }).id)));
  const now = new Date().toISOString();
  const toWrite = replace ? portfolios : portfolios.filter((p) => !existing.has(p.id));
  const skipped = portfolios.length - toWrite.length;

  if (toWrite.length > 0) {
    const rows = toWrite.map((p) => ({
      id: p.id,
      name: p.name,
      source: p.source,
      capital: p.capital,
      config: p.config,
      // is_active เก็บซ้ำเป็นคอลัมน์เพื่อให้ index/ORDER BY ใช้ได้ — ต้นฉบับยังอยู่ใน config
      is_active: isActiveConfig(p.config),
      updated_at: now,
    }));
    const { error } = await supabase.from(TABLE).upsert(rows, { onConflict: "id" });
    if (isMissingTableError(error)) throw missingMigration("นำเข้าพอร์ต");
    if (error) throw new HttpError(500, `บันทึกพอร์ตไม่สำเร็จ: ${error.message}`);
  }

  return ok({
    saved: toWrite.length,
    skipped,
    replaced: replace,
    ids: toWrite.map((p) => p.id),
  });
});

export const GET = route(async (request) => {
  // คนที่เปิดหน้าเว็บ = ล็อกอิน LINE + มีสิทธิ์ดูหน้าหวย
  // สคริปต์ฝั่ง Python (รายงาน LINE ที่ยังรันอยู่ฝั่งโน้น) = shared secret ตัวเดียวกับ POST
  // — secret นี้ "เขียน" พอร์ตได้อยู่แล้ว การให้ "อ่าน" จึงไม่ได้เพิ่มสิทธิ์อะไรใหม่
  if (request.headers.get(INGEST_SECRET_HEADER)) {
    requireIngestSecret(request);
  } else {
    await requireLotteryViewer(request);
  }

  const { data, error } = await supabaseAdmin()
    .from(TABLE)
    .select(COLUMNS)
    .order("is_active", { ascending: false })
    .order("id", { ascending: true });

  if (isMissingTableError(error)) throw missingMigration("อ่านพอร์ต");
  if (error) throw new HttpError(500, `อ่านพอร์ตไม่สำเร็จ: ${error.message}`);

  // config ถูกตรวจด้วย zod ตั้งแต่ตอนเขียนแล้ว — ตรงนี้ส่งคืนทั้งก้อนตามเดิม
  // (คีย์เป็น snake_case เหมือนฝั่ง Python เสมอ ห้ามแปลงเป็น camelCase)
  return ok({ portfolios: (data ?? []) as unknown as PortfolioRow[] });
});

export const PUT = route(async (request) => {
  await requireAdmin(request);

  const parsed = portfolioSavePayloadSchema.safeParse(await readJsonBody(request, MAX_BODY_BYTES));
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new HttpError(
      400,
      `ข้อมูลผิดรูปแบบ: ${first?.path.join(".")} — ${first?.message}`,
      "bad_payload",
    );
  }

  const supabase = supabaseAdmin();
  let id = parsed.data.id;

  // ไม่ส่ง id = พอร์ตใหม่ → ต่อจาก id ที่มากสุด (id ชุดแรกมาจาก SQLite ฝั่งโน้น
  // จึงใช้ sequence ของ Postgres ไม่ได้ ไม่งั้นจะชนกับ id ที่นำเข้ามา)
  if (id === undefined) {
    const { data, error } = await supabase
      .from(TABLE)
      .select("id")
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (isMissingTableError(error)) throw missingMigration("บันทึกพอร์ต");
    if (error) throw new HttpError(500, `หาเลขพอร์ตถัดไปไม่สำเร็จ: ${error.message}`);
    id = Number((data as { id: number } | null)?.id ?? 0) + 1;
  }

  const row = {
    id,
    name: parsed.data.name,
    source: parsed.data.source,
    capital: parsed.data.capital,
    config: parsed.data.config,
    is_active: isActiveConfig(parsed.data.config),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(TABLE)
    .upsert(row, { onConflict: "id" })
    .select(COLUMNS)
    .single();

  if (isMissingTableError(error)) throw missingMigration("บันทึกพอร์ต");
  if (error) throw new HttpError(500, `บันทึกพอร์ตไม่สำเร็จ: ${error.message}`);

  return ok({ portfolio: data as unknown as PortfolioRow });
});
