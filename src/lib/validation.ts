import { z } from "zod";

export const directionSchema = z.enum(["deposit", "withdraw"]);

export const transactionInputSchema = z.object({
  siteId: z.string().uuid("กรุณาเลือกเว็บ"),
  direction: directionSchema,
  amount: z.number().positive("ยอดเงินต้องมากกว่า 0").max(100_000_000),
  /** เวลาท้องถิ่นจากฟอร์ม เช่น "2026-08-25T14:30" */
  occurredAtLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/, "รูปแบบวันเวลาไม่ถูกต้อง"),
  refNo: z.string().max(200).nullish(),
  bankName: z.string().max(200).nullish(),
  counterparty: z.string().max(200).nullish(),
  note: z.string().max(1000).nullish(),
  imagePath: z.string().max(500).nullish(),
  imageHash: z.string().length(64).nullish(),
  /** ภาพหน้าฝาก/ถอนของเว็บที่อัปโหลดคู่มากับสลิป */
  webImagePath: z.string().max(500).nullish(),
  /** รหัสรายการที่เว็บออกให้ เช่น QR-2737703011042845 */
  webRefNo: z.string().max(200).nullish(),
  siteUrl: z.string().max(200).nullish(),
  /** บัญชีของเรา — ขาฝากคือบัญชีที่โอนออก ขาถอนคือบัญชีที่รับเงิน */
  accountNo: z.string().max(40).nullish(),
  accountName: z.string().max(200).nullish(),
  /** บัญชีของเว็บ (อีกฝั่งของรายการ) */
  counterpartyBank: z.string().max(200).nullish(),
  counterpartyAccountNo: z.string().max(40).nullish(),
  ocrStatus: z.enum(["manual", "ocr", "ocr_edited", "failed"]).default("manual"),
  ocrConfidence: z.number().min(0).max(1).nullish(),
  ocrRaw: z.unknown().nullish(),
});

export const transactionPatchSchema = transactionInputSchema
  .partial()
  .omit({ imagePath: true, imageHash: true, webImagePath: true, ocrRaw: true });

/** โดเมนของเว็บ เช่น "chokddd365.run" — รับแบบมี https:// หรือ / ต่อท้ายมาด้วยก็ได้ */
const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .transform((value) => value.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
  .refine((value) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(value), "โดเมนไม่ถูกต้อง เช่น chokddd365.run")
  .refine((value) => value.length <= 120, "โดเมนยาวเกินไป");

export const siteInputSchema = z.object({
  name: z.string().trim().min(1, "กรุณาใส่ชื่อเว็บ").max(80),
  /** ผูกโดเมนไว้ เพื่อให้ระบบเลือกเว็บนี้ให้อัตโนมัติเมื่ออ่านเจอโดเมนบนภาพ */
  domain: domainSchema.nullish(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "สีต้องเป็นรหัส HEX เช่น #2563eb")
    .nullish(),
  /** อิโมจิเดียว แต่บางตัวประกอบจากหลาย code point เลยเผื่อความยาวไว้ */
  emoji: z.string().trim().min(1).max(16).nullish(),
  note: z.string().max(500).nullish(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
});

export const sitePatchSchema = siteInputSchema.partial().extend({
  isActive: z.boolean().optional(),
});

/** อ่าน body เป็น JSON แล้ว validate — คืน error ภาษาไทยถ้าไม่ผ่าน */
export function parseOrThrow<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path?.join(".");
    throw new Error(path ? `${path}: ${first.message}` : (first?.message ?? "ข้อมูลไม่ถูกต้อง"));
  }
  return result.data;
}

/** ผู้ดูแลเปิด/ปิดสิทธิ์ของสมาชิก — ส่งมาอย่างน้อยหนึ่งอย่าง */
export const memberPatchSchema = z
  .object({
    isActive: z.boolean().optional(),
    canViewAll: z.boolean().optional(),
  })
  .refine((v) => v.isActive !== undefined || v.canViewAll !== undefined, {
    message: "ไม่มีข้อมูลที่จะแก้ไข",
  });
