export type Direction = "deposit" | "withdraw";

export type OcrStatus = "manual" | "ocr" | "ocr_edited" | "failed";

export interface AuthUser {
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
  /** ผู้ดูแลระบบ — กำหนดสิทธิ์ให้สมาชิกคนอื่นได้ (มาจาก LINE_ADMIN_USER_IDS) */
  isAdmin: boolean;
  /** เห็นรายการและสรุปยอดของทุกคน (อ่านอย่างเดียว) — ค่าเริ่มต้นคือเห็นเฉพาะของตัวเอง */
  canViewAll: boolean;
}

/** แถวผู้ใช้ที่หน้าผู้ดูแลเอาไปแสดง */
export interface MemberRow {
  id: string;
  line_user_id: string;
  display_name: string | null;
  picture_url: string | null;
  is_active: boolean;
  can_view_all: boolean;
  approved_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  /** เติมจากฝั่ง server ตาม LINE_ADMIN_USER_IDS */
  is_admin: boolean;
}

export interface SiteRow {
  id: string;
  /** ไม่ใช้แล้ว — เว็บทุกแถวเป็นของส่วนกลาง (ดู migration 0006) */
  owner_id: string | null;
  name: string;
  note: string | null;
  color: string | null;
  /** อิโมจิประจำเว็บ — optional เพราะฐานข้อมูลที่ยังไม่รัน migration 0005 จะไม่มีคอลัมน์นี้ */
  emoji?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface TransactionRow {
  id: string;
  owner_id: string;
  site_id: string;
  direction: Direction;
  amount: number;
  occurred_at: string;
  occurred_date: string;
  ref_no: string | null;
  bank_name: string | null;
  counterparty: string | null;
  note: string | null;
  image_path: string | null;
  image_hash: string | null;
  ocr_status: OcrStatus;
  ocr_confidence: number | null;
  created_at: string;
}

export interface TransactionWithSite extends TransactionRow {
  site: Pick<SiteRow, "id" | "name" | "color"> | null;
  /** เจ้าของรายการ — มีค่าเฉพาะตอนดูข้ามบัญชีด้วยสิทธิ์ can_view_all */
  owner?: { display_name: string | null } | null;
}

/** ข้อมูลที่ถอดจาก QR ตรวจสอบสลิปของธนาคาร — อ่านตรงจากรูป ไม่ผ่านการตีความ */
export interface SlipQr {
  /** ข้อความดิบใน QR */
  payload: string;
  /** เลขที่รายการ (transaction reference) ตรงกับที่พิมพ์บนสลิป */
  transRef: string;
  /** รหัสธนาคารต้นทาง 3 หลัก เช่น "004" */
  sendingBankCode: string | null;
  sendingBankName: string | null;
  countryCode: string | null;
  /** CRC ท้าย payload ตรวจแล้วผ่าน (สลิปบางใบไม่มี CRC มาให้ตรวจ) */
  crcVerified: boolean;
}

export type OcrSource = "qr" | "vision";

/** ผลที่อ่านได้จากรูป หลังผ่านการปรับค่าให้พร้อมใช้แล้ว */
export interface OcrResult {
  direction: Direction | null;
  amount: number | null;
  occurredAt: string | null;
  occurredAtLocal: string | null;
  refNo: string | null;
  bankName: string | null;
  counterparty: string | null;
  siteHint: string | null;
  confidence: number;
  documentType: string;
  warnings: string[];
  /**
   * ค่านี้ผ่านตัวอ่านอะไรมาบ้าง เรียงตามลำดับที่ทำงาน
   *   qr     — ถอด QR ตรวจสอบสลิปเองในเครื่อง (แม่นที่สุด ไม่มีค่าใช้จ่าย)
   *   vision — Google Cloud Vision อ่านตัวหนังสือ
   */
  sources: OcrSource[];
  qr: SlipQr | null;
  raw: unknown;
}

export interface SummaryBucket {
  key: string;
  label: string;
  deposit: number;
  withdraw: number;
  net: number;
  count: number;
}

/** เงินที่ถอนออกจากเว็บ แยกตามธนาคารปลายทางที่รับเงิน */
export interface BankBucket {
  /** ชื่อธนาคารที่ตัดคำว่า "ธนาคาร" ออกแล้ว ใช้เป็นทั้ง key และป้าย */
  key: string;
  amount: number;
  count: number;
}

export interface SummaryResponse {
  from: string;
  to: string;
  totals: { deposit: number; withdraw: number; net: number; count: number };
  byDay: SummaryBucket[];
  byMonth: SummaryBucket[];
  bySite: (SummaryBucket & { siteId: string; color: string | null })[];
  /** เฉพาะรายการเงินออกจากเว็บ — เงินเข้าเว็บไม่นับ เพราะปลายทางคือเว็บไม่ใช่ธนาคารเรา */
  byBank: BankBucket[];
}
