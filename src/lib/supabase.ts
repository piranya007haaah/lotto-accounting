import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let client: SupabaseClient | null = null;

/**
 * Supabase client ฝั่ง server ที่ใช้ service_role key
 * — ข้าม RLS ได้ จึงต้องกรอง owner_id ด้วยตัวเองทุกครั้ง (ดู lib/auth.ts)
 */
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
