"use client";

/**
 * ย่อรูปก่อนอัปโหลด — ลดเวลาอัปโหลดบนเน็ตมือถือและลดต้นทุนตอนให้โมเดลอ่าน
 * ถ้าย่อไม่สำเร็จจะคืนไฟล์เดิมกลับไป
 */
export async function compressImage(
  file: File,
  maxEdge = 1600,
  quality = 0.85,
): Promise<File> {
  if (typeof window === "undefined" || typeof createImageBitmap !== "function") return file;
  if (file.size < 200 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "slip";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}
