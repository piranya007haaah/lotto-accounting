export type Direction = "deposit" | "withdraw";

export type OcrStatus = "manual" | "ocr" | "ocr_edited" | "failed";

export interface AuthUser {
  id: string;
  lineUserId: string;
  displayName: string | null;
  pictureUrl: string | null;
}

export interface SiteRow {
  id: string;
  owner_id: string | null;
  name: string;
  note: string | null;
  color: string | null;
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
}

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

export interface SummaryResponse {
  from: string;
  to: string;
  totals: { deposit: number; withdraw: number; net: number; count: number };
  byDay: SummaryBucket[];
  byMonth: SummaryBucket[];
  bySite: (SummaryBucket & { siteId: string; color: string | null })[];
}
