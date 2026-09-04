import { allowedLineUserIds, isAdminLineUserId, isDevAuthBypassEnabled, requireEnv } from "./env";
import { HttpError } from "./http";
import { isMissingColumnError, supabaseAdmin } from "./supabase";
import type { AuthUser } from "./types";

interface VerifiedIdToken {
  sub: string;
  name?: string;
  picture?: string;
  exp: number;
}

/** cache ผลตรวจ token ไว้สั้น ๆ กันยิง LINE ทุก request */
const tokenCache = new Map<string, { token: VerifiedIdToken; expiresAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

function pruneCache() {
  if (tokenCache.size < 500) return;
  const now = Date.now();
  for (const [key, value] of tokenCache) {
    if (value.expiresAt <= now) tokenCache.delete(key);
  }
  if (tokenCache.size >= 500) tokenCache.clear();
}

/** ตรวจ ID token กับ LINE — เอกสาร: https://developers.line.biz/en/reference/line-login/#verify-id-token */
async function verifyIdToken(idToken: string): Promise<VerifiedIdToken> {
  const cached = tokenCache.get(idToken);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const response = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id_token: idToken,
      client_id: requireEnv("LINE_LOGIN_CHANNEL_ID"),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new HttpError(401, `ตรวจสอบการล็อกอิน LINE ไม่ผ่าน ${detail}`.trim(), "invalid_id_token");
  }

  const token = (await response.json()) as VerifiedIdToken;
  if (!token?.sub) {
    throw new HttpError(401, "LINE ID token ไม่มีข้อมูลผู้ใช้", "invalid_id_token");
  }

  pruneCache();
  const expiresAt = Math.min(Date.now() + TOKEN_CACHE_TTL_MS, (token.exp ?? 0) * 1000 || Infinity);
  tokenCache.set(idToken, { token, expiresAt });
  return token;
}

/** หา (หรือสร้าง) แถวผู้ใช้จาก LINE userId */
export async function getOrCreateUser(profile: {
  lineUserId: string;
  displayName?: string | null;
  pictureUrl?: string | null;
}): Promise<AuthUser> {
  const allowed = allowedLineUserIds();
  if (allowed && !allowed.includes(profile.lineUserId)) {
    throw new HttpError(403, "บัญชี LINE นี้ยังไม่ได้รับสิทธิ์ใช้งานระบบ", "not_allowed");
  }

  const isAdmin = isAdminLineUserId(profile.lineUserId);

  const payload: Record<string, unknown> = {
    line_user_id: profile.lineUserId,
    display_name: profile.displayName ?? null,
    picture_url: profile.pictureUrl ?? null,
    last_seen_at: new Date().toISOString(),
  };
  // ผู้ดูแลเปิดใช้งานให้เสมอ — กันกรณีเผลอกดปิดสิทธิ์ตัวเองแล้วเข้าระบบไม่ได้อีก
  if (isAdmin) payload.is_active = true;

  const supabase = supabaseAdmin();
  const columns = "id, line_user_id, display_name, picture_url, is_active, can_view_all";
  let { data, error } = await supabase
    .from("app_users")
    .upsert(payload, { onConflict: "line_user_id" })
    .select(`${columns}, can_view_lottery`)
    .single();

  // ยังไม่ได้รัน migration 0010 = ไม่มีคอลัมน์ can_view_lottery — ให้ล็อกอินได้ตามปกติ
  // แล้วถือว่าไม่มีใครมีสิทธิ์ดูหน้าหวย (ยกเว้นผู้ดูแล) ดีกว่าล็อกทุกคนออกจากทั้งแอป
  if (isMissingColumnError(error, "can_view_lottery")) {
    ({ data, error } = await supabase
      .from("app_users")
      .upsert(payload, { onConflict: "line_user_id" })
      .select(columns)
      .single());
  }

  if (error) throw new HttpError(500, `บันทึกข้อมูลผู้ใช้ไม่สำเร็จ: ${error.message}`);
  if (!data) throw new HttpError(500, "บันทึกข้อมูลผู้ใช้ไม่สำเร็จ");
  if (!data.is_active) {
    // ครอบทั้งคนที่เพิ่งเข้ามาครั้งแรก และคนที่ถูกถอนสิทธิ์ภายหลัง
    throw new HttpError(403, "บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน — รอผู้ดูแลอนุมัติ", "pending_approval");
  }

  return {
    id: data.id as string,
    lineUserId: data.line_user_id as string,
    displayName: data.display_name as string | null,
    pictureUrl: data.picture_url as string | null,
    isAdmin,
    // ผู้ดูแลเห็นทุกบัญชีเสมอ — หน้า /admin ไม่มีปุ่มเปิดสิทธิ์นี้ให้ตัวเอง
    // (เปิดให้คนอื่นได้อย่างเดียว) ถ้าไม่ให้อัตโนมัติก็จะเปิดของตัวเองไม่ได้เลย
    canViewAll: Boolean(data.can_view_all) || isAdmin,
    // ผู้ดูแลเห็นโหมดหวยเสมอ (เป็นพอร์ตของเจ้าของเอง) — คนอื่นต้องถูกเปิดสิทธิ์ที่หน้า /admin
    canViewLottery: Boolean((data as { can_view_lottery?: boolean }).can_view_lottery) || isAdmin,
  };
}

/**
 * ดึงผู้ใช้ปัจจุบันจาก request
 * ปกติ: header `Authorization: Bearer <LINE ID token>` ที่ได้จาก liff.getIDToken()
 * ตอน dev: ตั้ง DEV_AUTH_BYPASS=true แล้วส่ง header `x-dev-line-user-id` แทนได้
 */
export async function requireUser(request: Request): Promise<AuthUser> {
  if (isDevAuthBypassEnabled()) {
    const devUserId = request.headers.get("x-dev-line-user-id");
    if (devUserId) {
      return getOrCreateUser({ lineUserId: devUserId, displayName: `dev:${devUserId}` });
    }
  }

  const header = request.headers.get("authorization") ?? "";
  const idToken = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
  if (!idToken) {
    throw new HttpError(401, "กรุณาเข้าสู่ระบบด้วย LINE ก่อน", "no_token");
  }

  const token = await verifyIdToken(idToken);
  return getOrCreateUser({
    lineUserId: token.sub,
    displayName: token.name ?? null,
    pictureUrl: token.picture ?? null,
  });
}

/**
 * เหมือน requireUser แต่ต้องมีสิทธิ์ดูโหมดหวย (พอร์ต/สูตร)
 *
 * ⚠️ หน้าหวยโชว์เงินจริงของเจ้าของ — เปิดให้คนอื่นทีละคนที่หน้า /admin เท่านั้น
 * ไม่ใช่เปิดให้ทุกคนที่ล็อกอินได้
 */
export async function requireLotteryViewer(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (!user.canViewLottery) {
    throw new HttpError(403, "หน้าหวยเปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต", "not_lottery_viewer");
  }
  return user;
}

/** เหมือน requireUser แต่ต้องเป็นผู้ดูแลเท่านั้น */
export async function requireAdmin(request: Request): Promise<AuthUser> {
  const user = await requireUser(request);
  if (!user.isAdmin) {
    throw new HttpError(403, "หน้านี้สำหรับผู้ดูแลเท่านั้น", "not_admin");
  }
  return user;
}
