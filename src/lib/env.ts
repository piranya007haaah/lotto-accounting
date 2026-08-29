/** อ่านค่า env แบบ trim และถือว่าค่าว่าง = ไม่ได้ตั้ง */
export function env(name: string): string | undefined {
  const value = process.env[name];
  if (!value) return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

export function requireEnv(name: string): string {
  const value = env(name);
  if (!value) {
    throw new Error(`ยังไม่ได้ตั้งค่า environment variable: ${name} (ดูตัวอย่างใน .env.example)`);
  }
  return value;
}

/** โซนเวลาที่ใช้ตัดยอดรายวัน/รายเดือน */
export const APP_TIMEZONE = env("APP_TIMEZONE") ?? "Asia/Bangkok";

/** ชื่อ storage bucket ที่เก็บรูปสลิป */
export const STORAGE_BUCKET = env("SUPABASE_STORAGE_BUCKET") ?? "slips";

/** API key ของ Google Cloud Vision — ตัวที่ใช้อ่านตัวหนังสือบนรูป */
export function GOOGLE_VISION_API_KEY(): string | undefined {
  return env("GOOGLE_VISION_API_KEY");
}

export function isVisionConfigured(): boolean {
  return Boolean(GOOGLE_VISION_API_KEY());
}



/** ข้าม LINE Login ได้เฉพาะตอน dev และต้องเปิดสวิตช์เองเท่านั้น */
export function isDevAuthBypassEnabled(): boolean {
  return process.env.NODE_ENV !== "production" && env("DEV_AUTH_BYPASS") === "true";
}

/** จำกัดรายชื่อผู้ใช้ (ถ้าไม่ตั้ง = ใครล็อกอินก็ใช้ได้ แต่ข้อมูลแยกกันคนละชุด) */
export function allowedLineUserIds(): string[] | null {
  const raw = env("LINE_ALLOWED_USER_IDS");
  if (!raw) return null;
  const ids = raw.split(",").map((s) => s.trim()).filter(Boolean);
  return ids.length > 0 ? ids : null;
}

export function appUrl(): string {
  return env("NEXT_PUBLIC_APP_URL") ?? "http://localhost:3000";
}

/**
 * LINE userId ของผู้ดูแล คั่นด้วย comma
 * ตั้งใน env เท่านั้น (ไม่เก็บใน DB) เพื่อให้ยกระดับสิทธิ์จากในแอปไม่ได้
 * และผู้ดูแลจะล็อกตัวเองออกจากระบบไม่ได้
 */
export function adminLineUserIds(): string[] {
  const raw = env("LINE_ADMIN_USER_IDS");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

export function isAdminLineUserId(lineUserId: string): boolean {
  return adminLineUserIds().includes(lineUserId);
}
