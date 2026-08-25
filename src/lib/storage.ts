import crypto from "node:crypto";
import { STORAGE_BUCKET } from "./env";
import { HttpError } from "./http";
import { supabaseAdmin } from "./supabase";

export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function extensionFor(mediaType: string): string {
  return EXTENSIONS[mediaType] ?? "jpg";
}

export function sha256(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

/** อัปโหลดไปที่โฟลเดอร์ชั่วคราวก่อน จะย้ายเข้าที่จริงตอนกดบันทึก */
export async function uploadTemp(
  ownerId: string,
  buffer: Buffer,
  mediaType: string,
): Promise<string> {
  const path = `${ownerId}/tmp/${crypto.randomUUID()}.${extensionFor(mediaType)}`;
  const { error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .upload(path, buffer, { contentType: mediaType, upsert: false });
  if (error) throw new HttpError(500, `อัปโหลดรูปไม่สำเร็จ: ${error.message}`);
  return path;
}

/** ย้ายรูปจาก tmp ไปเก็บถาวรตามเดือนของรายการ */
export async function moveToFinal(
  ownerId: string,
  tempPath: string,
  monthKey: string,
): Promise<string> {
  if (!tempPath.startsWith(`${ownerId}/tmp/`)) {
    throw new HttpError(400, "path ของรูปไม่ถูกต้อง");
  }
  const fileName = tempPath.split("/").pop()!;
  const finalPath = `${ownerId}/${monthKey}/${fileName}`;
  const { error } = await supabaseAdmin()
    .storage.from(STORAGE_BUCKET)
    .move(tempPath, finalPath);
  if (error) throw new HttpError(500, `ย้ายไฟล์รูปไม่สำเร็จ: ${error.message}`);
  return finalPath;
}

export async function removeImage(path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabaseAdmin().storage.from(STORAGE_BUCKET).remove([path]);
  if (error) console.error(`[storage] ลบรูปไม่สำเร็จ ${path}: ${error.message}`);
}
