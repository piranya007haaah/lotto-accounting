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

/** สมาชิกแบบย่อ ไว้เลือกว่ากำลังดูรายการของใคร (ไม่มีข้อมูลสิทธิ์ติดมาด้วย) */
export interface MemberOption {
  id: string;
  display_name: string | null;
  picture_url: string | null;
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
  /** โดเมนของเว็บ เช่น "chokddd365.run" — ใช้จับคู่เว็บจากภาพหน้าจอ (migration 0007) */
  domain?: string | null;
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
  /** ต่อไปนี้มาพร้อม migration 0007 — optional เพราะฐานข้อมูลที่ยังไม่ได้รันจะไม่มีคอลัมน์เหล่านี้ */
  web_image_path?: string | null;
  web_ref_no?: string | null;
  site_url?: string | null;
  account_no?: string | null;
  account_name?: string | null;
  counterparty_bank?: string | null;
  counterparty_account_no?: string | null;
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

/** บัญชีธนาคารหนึ่งบัญชีที่อ่านได้จากหน้าฝาก/ถอนของเว็บ */
export interface AccountRef {
  /** ชื่อธนาคารแบบสั้น เช่น "ไทยพาณิชย์" */
  bank: string | null;
  accountNo: string | null;
  accountName: string | null;
}

/** ผลที่อ่านได้จากภาพหน้าฝาก/ถอนของเว็บ (คนละแบบกับสลิปธนาคาร) */
export interface WebPageResult {
  direction: Direction | null;
  amount: number | null;
  /** บัญชีที่หน้าเว็บบอกให้โอนออก — ฝาก = บัญชีเรา, ถอน = บัญชีของเว็บ */
  fromAccount: AccountRef | null;
  /** บัญชีปลายทาง — ฝาก = บัญชีของเว็บ, ถอน = บัญชีเรา */
  toAccount: AccountRef | null;
  /** โดเมนที่เห็นบนภาพ เช่น "chokddd365.run" — ใช้เดาว่าเป็นเว็บไหน */
  domain: string | null;
  /** รหัสรายการของเว็บ เช่น "QR-2737703011042845" (คนละตัวกับเลขที่รายการบนสลิป) */
  refCode: string | null;
  /** เวลาที่หน้าเว็บระบุ เช่น "14:34" */
  timeLocal: string | null;
  /** วันเวลาเต็มถ้าหน้านั้นมีให้ (หน้ารายการฝาก-ถอนมี ส่วนหน้าแจ้งโอนมีแต่เวลา) */
  occurredAtLocal: string | null;
  siteHint: string | null;
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
  /** ชื่อผู้รับเงินบนสลิป */
  counterparty: string | null;
  /** เลขบัญชีผู้รับตามที่พิมพ์บนสลิป (ถูกปิดบังบางส่วน) */
  counterpartyAccountNo: string | null;
  /** ผู้โอน — ขาฝากคือบัญชีของเราที่เงินออก */
  senderName: string | null;
  senderAccountNo: string | null;
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

/** ยอดที่วิ่งผ่านบัญชีธนาคารของเรา แยกตามธนาคาร */
export interface BankBucket {
  /** ชื่อธนาคารที่ตัดคำว่า "ธนาคาร" ออกแล้ว ใช้เป็นทั้ง key และป้าย */
  key: string;
  /** เงินที่โอนออกจากบัญชีธนาคารนี้เข้าเว็บ */
  deposit: number;
  /** เงินที่ถอนจากเว็บเข้าบัญชีธนาคารนี้ */
  withdraw: number;
  count: number;
}

export interface SummaryResponse {
  from: string;
  to: string;
  totals: { deposit: number; withdraw: number; net: number; count: number };
  byDay: SummaryBucket[];
  byMonth: SummaryBucket[];
  bySite: (SummaryBucket & { siteId: string; color: string | null })[];
  /** แยกตามธนาคารของบัญชีเรา — ขาเข้าเว็บคือบัญชีที่โอนออก ขาออกจากเว็บคือบัญชีที่รับเงิน */
  byBank: BankBucket[];
}
