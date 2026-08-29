import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/**
 * Supabase client ฝั่ง server ที่ใช้ service_role key
 * — ข้าม RLS ได้ จึงต้องกรอง owner_id ด้วยตัวเองทุกครั้ง (ดู lib/auth.ts)
 */
/**
 * จริงไหมว่า error เกิดจากคอลัมน์ที่ยังไม่มีในฐานข้อมูล (migration ยังไม่ได้รัน)
 * — PostgREST คืน PGRST204 ตอน insert/update, Postgres คืน 42703 ตอน select
 */
export function isMissingColumnError(
  error: { code?: string; message?: string } | null,
  column: string,
): boolean {
  if (!error) return false;
  if (error.code !== "PGRST204" && error.code !== "42703") return false;
  return (error.message ?? "").includes(column);
}

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
  }
  return client;
}
