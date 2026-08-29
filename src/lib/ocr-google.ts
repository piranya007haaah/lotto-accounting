import { GOOGLE_VISION_ENDPOINT, googleVisionApiKey } from "./env";
import { HttpError } from "./http";
import {
  normalizeExtraction,
  type ExtractionRaw,
  type SupportedImageType,
} from "./ocr-extraction";
import { parseLooseDateTime, toDatetimeLocalValue } from "./thai-date";
import type { OcrResult } from "./types";

/**
 * ตัวอ่านรูปด้วย Google Cloud Vision
 *
 * Vision คืนมาแค่ "ข้อความบนรูป" ไม่ได้คืนเป็นฟิลด์ให้ เราจึงต้อง parse เอง
 * ข้อดีคือฟรี 1,000 รูปแรกต่อเดือน และไม่มีค่าโมเดลต่อรูป
 * ข้อเสียคือกติกาการอ่านเป็นแบบ heuristic — ความมั่นใจจึงไม่เกิน 0.9 เสมอ
 */

// ---------------------------------------------------------------- Vision API

interface VisionAnnotateResponse {
  responses?: Array<{
    fullTextAnnotation?: { text?: string };
    textAnnotations?: Array<{ description?: string }>;
    error?: { code?: number; message?: string; status?: string };
  }>;
  error?: { code?: number; message?: string; status?: string };
}

const REQUEST_TIMEOUT_MS = 30_000;

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as VisionAnnotateResponse;
    return body.error?.message ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

/** เรียก Vision แล้วคืนข้อความทั้งหมดที่อ่านได้จากรูป */
export async function readTextFromImage(base64: string): Promise<string> {
  const apiKey = googleVisionApiKey();
  if (!apiKey) {
    throw new HttpError(
      501,
      "ยังไม่ได้ตั้งค่า GOOGLE_VISION_API_KEY จึงอ่านรูปอัตโนมัติไม่ได้",
      "ocr_not_configured",
    );
  }

  let response: Response;
  try {
    response = await fetch(GOOGLE_VISION_ENDPOINT, {
      method: "POST",
      // ส่งคีย์ทาง header ไม่ใช่ query string เพื่อไม่ให้คีย์ไปโผล่ใน log
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        requests: [
          {
            image: { content: base64 },
            features: [{ type: "DOCUMENT_TEXT_DETECTION", maxResults: 1 }],
            imageContext: { languageHints: ["th", "en"] },
          },
        ],
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "ไม่ทราบสาเหตุ";
    throw new HttpError(504, `ต่อ Google Vision ไม่ได้: ${reason}`, "ocr_provider_unreachable");
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);
    if (response.status === 400 && /api key not valid|api_key_invalid/i.test(detail)) {
      throw new HttpError(500, "GOOGLE_VISION_API_KEY ไม่ถูกต้อง", "ocr_bad_key");
    }
    if (response.status === 403) {
      throw new HttpError(
        500,
        `Google Vision ปฏิเสธคำขอ — เช็คว่าเปิด Cloud Vision API และผูก billing แล้วหรือยัง (${detail})`,
        "ocr_forbidden",
      );
    }
    if (response.status === 429) {
      throw new HttpError(429, "เรียก Google Vision ถี่เกินโควตา ลองใหม่อีกครั้ง", "ocr_rate_limited");
    }
    throw new HttpError(502, `Google Vision ตอบกลับผิดพลาด: ${detail}`, "ocr_provider_error");
  }

  const payload = (await response.json()) as VisionAnnotateResponse;
  const result = payload.responses?.[0];
  if (result?.error?.message) {
    throw new HttpError(502, `Google Vision อ่านรูปไม่สำเร็จ: ${result.error.message}`, "ocr_provider_error");
  }

  return result?.fullTextAnnotation?.text ?? result?.textAnnotations?.[0]?.description ?? "";
}

// ------------------------------------------------------- ตัวช่วยจัดการข้อความ

/** แปลงเลขไทย/สระที่ OCR แยกชิ้น ให้เป็นรูปมาตรฐานก่อนเทียบคำ */
export function normalizeSlipText(raw: string): string {
  return raw
    .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
    .replace(/ํา/g, "ำ") // ◌ํ + า → ำ
    .replace(/เเ/g, "แ") // เ + เ → แ
    .replace(/[ ​]/g, " ");
}

/** ตัดช่องว่างและเครื่องหมายออก เพื่อเทียบคำสำคัญโดยไม่แคร์การเว้นวรรคของ OCR */
function squash(value: string): string {
  return value.replace(/[\s.\-_:()฿]/g, "").toLowerCase();
}

const AMOUNT_LABELS = [
  "จำนวนเงิน", "จำนวนที่โอน", "จำนวนที่ถอน", "จำนวน",
  "ยอดเงิน", "ยอดโอน", "ยอดถอน", "ยอดฝาก", "ยอดที่ถอน",
  "amount", "totalamount", "transferamount",
];

/** คำที่บอกว่าตัวเลขบรรทัดนี้ "ไม่ใช่" ยอดของรายการ */
const AMOUNT_BLOCKERS = [
  "คงเหลือ", "ค่าธรรมเนียม", "ธรรมเนียม", "เลขที่บัญชี", "เลขบัญชี",
  "วงเงิน", "สะสม", "แต้ม", "โบนัส", "เครดิต", "โทร",
  "balance", "available", "fee", "bonus", "credit", "point", "limit", "tel",
];

const REF_LABELS = [
  "เลขที่รายการ", "รหัสอ้างอิง", "เลขที่อ้างอิง", "หมายเลขอ้างอิง", "เลขอ้างอิง",
  "รหัสรายการ", "referenceno", "reference", "refno", "transactionid", "transid",
];

const COUNTERPARTY_LABELS = [
  "ไปยัง", "โอนไปยัง", "ผู้รับเงิน", "ผู้รับ", "บัญชีปลายทาง", "ชื่อบัญชีปลายทาง",
  "payee", "receiver", "to",
];

const WITHDRAW_HINTS = ["ถอนเงิน", "ถอนสำเร็จ", "รายการถอน", "แจ้งถอน", "ถอนเครดิต", "withdraw", "ถอน"];

const DEPOSIT_HINTS = [
  "โอนเงินสำเร็จ", "โอนสำเร็จ", "ชำระเงินสำเร็จ", "จ่ายเงินสำเร็จ", "ทำรายการสำเร็จ",
  "โอนเงิน", "ชำระเงิน", "จ่ายเงิน", "เติมเงิน", "ฝากเงิน",
  "พร้อมเพย์", "promptpay", "deposit", "transfer", "payment", "สแกนจ่าย",
];

/** เรียงจากชื่อที่เจาะจงกว่าไปหาชื่อสั้น เพราะเทียบแบบ substring (bangkokbank มีคำว่า kbank อยู่ข้างใน) */
const BANKS: Array<[string[], string]> = [
  [["ธนาคารกรุงเทพ", "bangkokbank", "bualuang", "bbl"], "กรุงเทพ"],
  [["กสิกรไทย", "kasikorn", "kbank", "kplus"], "กสิกรไทย"],
  [["ไทยพาณิชย์", "siamcommercial", "scbeasy", "scb"], "ไทยพาณิชย์"],
  [["กรุงไทย", "krungthai", "เป๋าตัง", "ktb"], "กรุงไทย"],
  [["กรุงศรีอยุธยา", "กรุงศรี", "krungsri", "ayudhya"], "กรุงศรีอยุธยา"],
  [["ทหารไทยธนชาต", "thanachart", "ttb", "tmb"], "ทหารไทยธนชาต (ttb)"],
  [["ออมสิน", "gsb"], "ออมสิน"],
  [["เพื่อการเกษตร", "ธกส", "baac"], "ธ.ก.ส."],
  [["ซีไอเอ็มบี", "cimb"], "ซีไอเอ็มบี ไทย"],
  [["ยูโอบี", "uob"], "ยูโอบี"],
  [["แลนด์แอนด์เฮ้าส์", "lhbank"], "แลนด์ แอนด์ เฮ้าส์"],
  [["เกียรตินาคิน", "kkp"], "เกียรตินาคินภัทร"],
  [["ทิสโก้", "tisco"], "ทิสโก้"],
  [["ไทยเครดิต", "thaicredit"], "ไทยเครดิต"],
  [["อิสลามแห่งประเทศไทย", "ibank"], "อิสลามแห่งประเทศไทย"],
  [["ทรูมันนี่", "truemoney", "truewallet"], "ทรูมันนี่ วอลเล็ท"],
];

/** ตัวเลขที่ไม่ได้ติดกับ วันที่ / เวลา / เลขบัญชี */
const NUMBER_TOKEN = /(?<![\d/\-:.])(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)(?![\d/\-:])/g;

const TIME_TOKEN = /\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:น\.?|am|pm|AM|PM)?/;

/** บรรทัดที่มีแต่ชื่อป้าย ไม่ใช่ค่า — สลิปบางแบบ Vision จะกองป้ายไว้ด้วยกันแล้วค่อยตามด้วยค่า */
const LABEL_ONLY = new Set([
  ...AMOUNT_LABELS,
  ...REF_LABELS,
  ...COUNTERPARTY_LABELS,
  "จาก", "from", "ค่าธรรมเนียม", "ธรรมเนียม", "fee", "รหัสร้านค้า", "รหัสธุรกรรม",
  "billerid", "เลขที่บัญชี", "เลขบัญชี", "ธนาคาร", "bank",
]);

function includesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

function startsWithAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.startsWith(needle));
}

/** กันวันที่เพี้ยนจากการอ่านเลขบัญชี/เบอร์โทรผิดเป็นวันที่ */
function saneDate(date: Date | null): Date | null {
  if (!date) return null;
  const now = Date.now();
  const fiveYears = 5 * 365 * 24 * 60 * 60 * 1000;
  const twoDays = 2 * 24 * 60 * 60 * 1000;
  const time = date.getTime();
  return time >= now - fiveYears && time <= now + twoDays ? date : null;
}

// ------------------------------------------------------------ ตัวอ่านทีละฟิลด์

interface Line {
  text: string;
  squashed: string;
  numbers: Array<{ raw: string; value: number }>;
}

function toLines(text: string): Line[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const numbers: Array<{ raw: string; value: number }> = [];
      for (const match of line.matchAll(NUMBER_TOKEN)) {
        const raw = match[1];
        const value = Number(raw.replace(/,/g, ""));
        if (Number.isFinite(value)) numbers.push({ raw, value });
      }
      return { text: line, squashed: squash(line), numbers };
    });
}

/**
 * เดายอดเงินของรายการด้วยการให้คะแนนตัวเลขทุกตัวที่เจอ
 * ตัวที่อยู่หลังคำว่า "จำนวนเงิน" และมีหน่วยบาทกำกับจะได้คะแนนสูงสุด
 */
function pickAmount(lines: Line[]): number | null {
  let best: { value: number; score: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (includesAny(line.squashed, AMOUNT_BLOCKERS)) continue;
    // บรรทัดที่เป็นวันที่ล้วน ๆ ไม่ใช่ยอดเงินแน่นอน
    if (line.numbers.length > 0 && saneDate(parseLooseDateTime(line.text))) continue;

    const labeledHere = includesAny(line.squashed, AMOUNT_LABELS);
    const previous = index > 0 ? lines[index - 1] : null;
    // รูปแบบ "จำนวนเงิน:" อยู่บรรทัดบน แล้วตัวเลขอยู่บรรทัดล่าง
    const labeledAbove = Boolean(
      previous &&
        previous.numbers.length === 0 &&
        includesAny(previous.squashed, AMOUNT_LABELS) &&
        !includesAny(previous.squashed, AMOUNT_BLOCKERS),
    );
    const hasCurrency = includesAny(line.squashed, ["บาท", "thb"]) || line.text.includes("฿");

    for (const { raw, value } of line.numbers) {
      if (value <= 0 || value > 10_000_000) continue;

      let score = 0;
      if (labeledHere) score += 5;
      if (labeledAbove) score += 4;
      if (hasCurrency) score += 2;
      if (/\.\d{2}$/.test(raw)) score += 2;
      if (raw.includes(",")) score += 1;
      // เลขโดด ๆ ไม่มีทศนิยม ไม่มีคอมมา ไม่มีคำกำกับ — เชื่อไม่ได้
      if (!labeledHere && !labeledAbove && !hasCurrency && !/[,.]/.test(raw)) score -= 2;
      // ช่วงที่มักเป็นเลขปี
      if (!raw.includes(".") && value >= 1900 && value <= 2700) score -= 3;

      if (score <= 0) continue;
      if (best === null || score > best.score) best = { value, score };
    }
  }

  return best === null ? null : best.value;
}

interface DateGuess {
  date: Date;
  dateText: string;
  timeText: string | null;
}

/** หาบรรทัดที่เป็นวันเวลาของรายการ — เลือกบรรทัดที่มีเวลากำกับก่อน */
function pickDate(lines: Line[]): DateGuess | null {
  let fallback: DateGuess | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const next = lines[index + 1];
    // วันที่กับเวลาบางทีอยู่คนละบรรทัด จึงลองต่อบรรทัดถัดไปด้วย
    const joined = next ? `${line.text} ${next.text}` : line.text;

    const own = saneDate(parseLooseDateTime(line.text));
    if (!own) continue;

    const ownTime = line.text.match(TIME_TOKEN)?.[0] ?? null;
    if (ownTime) {
      return { date: own, dateText: line.text.slice(0, 200), timeText: ownTime.trim() };
    }

    const nextTime = next?.text.match(TIME_TOKEN)?.[0] ?? null;
    const withNext = nextTime ? saneDate(parseLooseDateTime(joined)) : null;
    if (withNext && nextTime) {
      return { date: withNext, dateText: line.text.slice(0, 200), timeText: nextTime.trim() };
    }

    fallback ??= { date: own, dateText: line.text.slice(0, 200), timeText: null };
  }

  return fallback;
}

function pickRefNo(lines: Line[]): string | null {
  const pickToken = (text: string): string | null =>
    text.match(/[A-Za-z0-9]{8,32}/)?.[0] ?? null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!includesAny(line.squashed, REF_LABELS) && !startsWithAny(line.squashed, ["ref"])) continue;
    const here = pickToken(line.text.replace(/[A-Za-z]+\s*(no|id)\.?/i, " "));
    if (here) return here;
    const next = lines[index + 1];
    if (next) {
      const there = pickToken(next.text);
      if (there) return there;
    }
  }
  return null;
}

function pickBank(squashedAll: string): string | null {
  for (const [keywords, name] of BANKS) {
    if (includesAny(squashedAll, keywords)) return name;
  }
  return null;
}

/** ป้ายต้องตามด้วย ":" หรือช่องว่าง ไม่งั้นจะไปโดนประโยคอย่าง "ผู้รับเงินสามารถสแกน..." */
const COUNTERPARTY_LABEL_RE =
  /^(ชื่อบัญชีปลายทาง|บัญชีปลายทาง|โอนไปยัง|ผู้รับเงิน|ผู้รับ|ไปยัง|payee|receiver|to)/i;

function pickCounterparty(lines: Line[]): string | null {
  const clean = (value: string): string | null => {
    const trimmed = value.replace(/^[\s:：\-]+/, "").trim();
    if (trimmed.length < 3) return null;
    // ตัวเลขล้วนหรือเลขบัญชีที่ถูกปิดบัง ไม่ใช่ชื่อคน
    if (!/[A-Za-z฀-๿]/.test(trimmed)) return null;
    // บรรทัดที่เป็นชื่อป้ายเฉย ๆ (เช่น "จำนวนเงิน") ไม่ใช่ชื่อผู้รับ
    if (LABEL_ONLY.has(squash(trimmed))) return null;
    return trimmed.slice(0, 200);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const label = line.text.match(COUNTERPARTY_LABEL_RE)?.[1];
    if (!label) continue;

    const after = line.text.slice(label.length);
    if (after !== "" && !/^[\s:：]/.test(after)) continue;

    const rest = after.replace(/^[\s:：]+/, "").trim();
    if (rest) {
      const here = clean(rest);
      if (here) return here;
      continue;
    }

    // ป้ายอยู่บรรทัดเดียวโดด ๆ — ชื่อผู้รับน่าจะอยู่บรรทัดถัดไป
    const next = lines[index + 1];
    const there = next ? clean(next.text) : null;
    if (there) return there;
  }
  return null;
}

function pickSiteHint(squashedAll: string, siteNames: string[]): string | null {
  for (const name of siteNames) {
    const key = squash(name);
    if (key.length >= 2 && squashedAll.includes(key)) return name;
  }
  return null;
}

// ------------------------------------------------------------------ ตัวประกอบ

/** แปลงข้อความที่ Vision อ่านได้ ให้เป็นชุดข้อมูลเดียวกับที่ Claude คืนมา */
export function parseSlipText(rawText: string, siteNames: string[] = []): ExtractionRaw {
  const text = normalizeSlipText(rawText);
  const lines = toLines(text);
  const squashedAll = squash(text);

  const amount = pickAmount(lines);
  const dateGuess = pickDate(lines);
  const refNo = pickRefNo(lines);
  const bank = pickBank(squashedAll);
  const counterparty = pickCounterparty(lines);
  const siteHint = pickSiteHint(squashedAll, siteNames);

  const isWithdraw = includesAny(squashedAll, WITHDRAW_HINTS);
  const isDeposit = includesAny(squashedAll, DEPOSIT_HINTS);
  const direction: ExtractionRaw["direction"] = isWithdraw
    ? "withdraw"
    : isDeposit || bank
      ? "deposit"
      : "unknown";

  let documentType: ExtractionRaw["document_type"] = "other";
  if (lines.length === 0) documentType = "unreadable";
  else if (isWithdraw) documentType = "website_withdraw";
  else if (bank) documentType = "bank_transfer_slip";
  else if (isDeposit) documentType = "website_deposit";

  let confidence = 0.15;
  if (amount !== null) confidence += 0.4;
  if (dateGuess) confidence += 0.25;
  if (refNo) confidence += 0.08;
  if (bank) confidence += 0.07;
  if (direction !== "unknown") confidence += 0.05;

  const missing: string[] = [];
  if (amount === null) missing.push("ยอดเงิน");
  if (!dateGuess) missing.push("วันที่");

  return {
    document_type: documentType,
    direction,
    amount,
    date_text: dateGuess?.dateText ?? null,
    time_text: dateGuess?.timeText ?? null,
    datetime_iso: dateGuess ? toDatetimeLocalValue(dateGuess.date) : null,
    ref_no: refNo,
    bank_name: bank,
    counterparty,
    site_hint: siteHint,
    // เป็นการอ่านด้วยกฎ ไม่ใช่โมเดล จึงไม่ให้มั่นใจเกิน 0.9
    confidence: Math.round(Math.min(0.9, confidence) * 100) / 100,
    notes: missing.length > 0 ? `อ่านไม่เจอ: ${missing.join(", ")}` : null,
    provider: "google-vision",
    text: text.slice(0, 4000),
  };
}

export async function extractWithGoogleVision(params: {
  base64: string;
  mediaType: SupportedImageType;
  siteNames?: string[];
}): Promise<OcrResult> {
  const text = await readTextFromImage(params.base64);
  if (!text.trim()) {
    throw new HttpError(422, "อ่านตัวอักษรจากรูปนี้ไม่ได้ กรุณากรอกข้อมูลเอง", "ocr_empty");
  }
  return normalizeExtraction(parseSlipText(text, params.siteNames ?? []));
}
