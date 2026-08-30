import { findBank, normalizeThaiText, squash } from "./ocr-text";
import { toDatetimeLocalValue } from "./thai-date";
import type { AccountRef, Direction, OcrResult, OcrStatus, SlipQr, WebPageResult } from "./types";
import { webPageScore } from "./web-page";

/**
 * จับคู่ "ภาพหน้าเว็บ" กับ "สลิปธนาคาร" ที่อัปโหลดมาพร้อมกันหลายใบ
 *
 * ภาพสองแบบนี้บอกคนละอย่าง เอามารวมกันถึงจะได้รายการที่ครบ
 *   หน้าเว็บ → เว็บไหน, บัญชีที่โอนออก/เข้า, ชื่อเจ้าของบัญชี, ยอดที่แจ้ง
 *   สลิป     → เลขที่รายการจาก QR (กันบันทึกซ้ำ), วันเวลาจริง, ยอดจริง
 *
 * ทั้งไฟล์นี้ไม่ยุ่งกับฐานข้อมูลและเน็ต — ทดสอบกติกาได้ด้วย scripts/pair-check.ts
 */

export type DocKind = "slip" | "web";

/** คำที่บอกว่าเป็นสลิปของธนาคาร ไม่ใช่หน้าเว็บ */
const SLIP_MARKERS = [
  "สแกนตรวจสอบสลิป", "ตรวจสอบสลิป", "โอนเงินสำเร็จ", "ทำรายการสำเร็จ", "ชำระเงินสำเร็จ",
  "เลขที่รายการ", "รหัสอ้างอิง", "ค่าธรรมเนียม", "จำนวนเงิน", "พร้อมเพย์",
];

/** รูปหนึ่งใบที่อ่านเสร็จแล้ว — ยังไม่รู้ว่าจะไปคู่กับใบไหน */
export interface ReadImage {
  id: string;
  fileName: string;
  kind: DocKind;
  /** ลำดับที่ผู้ใช้เลือกไฟล์มา — คนมักเลือกเรียงเป็นคู่ ๆ อยู่แล้ว จึงใช้เป็นตัวช่วยตัดสิน */
  order: number;
  imagePath: string | null;
  imageHash: string;
  /** ค่าที่อ่านได้เมื่อรูปนี้เป็นสลิป */
  slip: OcrResult | null;
  /** ค่าที่อ่านได้เมื่อรูปนี้เป็นหน้าเว็บ */
  web: WebPageResult | null;
  /** รายการเดิมที่ตรงกับรูปนี้ — มีค่าแปลว่าเคยบันทึกไปแล้ว */
  duplicate: DuplicateRef | null;
  warnings: string[];
  error: string | null;
}

export interface DuplicateRef {
  id: string;
  amount: number;
  direction: Direction;
  occurredAt: string;
  siteName: string | null;
  /** image = ไฟล์เดียวกันเป๊ะ ๆ, ref = สลิปใบเดียวกัน, web_ref = รหัสรายการของเว็บซ้ำ */
  reason: "image" | "ref" | "web_ref";
}

/** รายการหนึ่งรายการที่ประกอบจากภาพหนึ่งหรือสองใบ พร้อมเติมลงฟอร์มได้เลย */
export interface PairDraft {
  key: string;
  web: ReadImage | null;
  slip: ReadImage | null;
  direction: Direction;
  amount: number | null;
  occurredAtLocal: string | null;
  refNo: string | null;
  webRefNo: string | null;
  /** ธนาคารของบัญชีเรา (ฝาก = บัญชีที่โอนออก, ถอน = บัญชีที่รับเงิน) */
  bankName: string | null;
  accountNo: string | null;
  accountName: string | null;
  /** ชื่อบัญชีของเว็บ (อีกฝั่งของรายการ) */
  counterparty: string | null;
  counterpartyBank: string | null;
  counterpartyAccountNo: string | null;
  siteUrl: string | null;
  ocrConfidence: number | null;
  ocrStatus: OcrStatus;
  /** มีค่าแปลว่าเคยบันทึกรูปนี้ไปแล้ว — บันทึกซ้ำไม่ได้ */
  duplicate: DuplicateRef | null;
  warnings: string[];
}

/**
 * รูปนี้เป็นสลิปหรือหน้าเว็บ
 * QR ตรวจสอบสลิปคือหลักฐานชั้นดีที่สุด ถอดได้เมื่อไหร่คือสลิปแน่นอน
 */
export function classifyDocument(input: { text: string | null; qr: SlipQr | null }): DocKind {
  if (input.qr) return "slip";
  if (!input.text) return "slip";

  const squashed = squash(normalizeThaiText(input.text));
  const slipScore =
    SLIP_MARKERS.filter((marker) => squashed.includes(marker)).length * 2 +
    (findBank(squashed) ? 1 : 0);

  return webPageScore(input.text) > slipScore ? "web" : "slip";
}

function minutesOf(hhmm: string | null | undefined): number | null {
  const match = hhmm?.match(/(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
}

/** ห่างกันกี่นาที โดยคิดแบบวนรอบวัน (23:55 กับ 00:05 ห่างกัน 10 นาที ไม่ใช่ 1430) */
function clockGap(a: string | null, b: string | null): number | null {
  const first = minutesOf(a);
  const second = minutesOf(b);
  if (first === null || second === null) return null;
  const raw = Math.abs(first - second);
  return Math.min(raw, 24 * 60 - raw);
}

/**
 * ห่างกันกี่นาทีระหว่างภาพสองใบ
 * มีวันที่ครบทั้งคู่ก็เทียบกันตรง ๆ (คนละวันจึงห่างกันมากตามจริง)
 * ถ้าหน้าเว็บบอกแต่เวลา ก็เทียบเฉพาะเวลาแบบวนรอบวัน
 */
function timeGap(web: WebPageResult | null, slip: OcrResult | null): number | null {
  if (web?.occurredAtLocal && slip?.occurredAtLocal) {
    const first = Date.parse(`${web.occurredAtLocal}:00`);
    const second = Date.parse(`${slip.occurredAtLocal}:00`);
    if (Number.isFinite(first) && Number.isFinite(second)) {
      return Math.round(Math.abs(first - second) / 60000);
    }
  }
  return clockGap(web?.timeLocal ?? null, slip?.occurredAtLocal ?? null);
}

/** ชื่อธนาคารสองค่านี้หมายถึงธนาคารเดียวกันไหม (คนละที่มาเขียนคนละแบบ) */
function sameBank(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const left = squash(a).replace(/^ธนาคาร/, "");
  const right = squash(b).replace(/^ธนาคาร/, "");
  if (!left || !right) return false;
  return left.includes(right) || right.includes(left);
}

/** บัญชีของเราอยู่ฝั่งไหนของหน้าเว็บ — ฝากคือฝั่งที่โอนออก ถอนคือฝั่งที่รับเงิน */
function ourSide(web: WebPageResult, direction: Direction): AccountRef | null {
  return direction === "deposit" ? web.fromAccount : web.toAccount;
}

function theirSide(web: WebPageResult, direction: Direction): AccountRef | null {
  return direction === "deposit" ? web.toAccount : web.fromAccount;
}

/**
 * คะแนนความน่าจะเป็นคู่กัน — ยอดตรงกันสำคัญที่สุด รองมาคือเวลาใกล้กัน
 * คะแนนติดลบได้ (ยอดไม่ตรง) แต่ยังเอาไปจับคู่รอบสองได้ถ้าไม่เหลือทางเลือกอื่น
 */
export function pairScore(web: ReadImage, slip: ReadImage): number {
  const webFields = web.web;
  const slipFields = slip.slip;
  let score = Math.max(0, 6 - Math.abs(web.order - slip.order));

  const webAmount = webFields?.amount ?? null;
  const slipAmount = slipFields?.amount ?? null;
  if (webAmount !== null && slipAmount !== null) {
    score += Math.abs(webAmount - slipAmount) < 0.01 ? 100 : -60;
  }

  const gap = timeGap(webFields, slipFields);
  if (gap !== null) score += gap <= 60 ? (60 - gap) / 2 : -5;

  const direction = webFields?.direction ?? "deposit";
  if (webFields && sameBank(ourSide(webFields, direction)?.bank, slipFields?.bankName)) {
    score += 12;
  }

  return score;
}

/** จับคู่ตัวที่คะแนนดีที่สุดก่อน ตัวไหนถูกใช้แล้วข้ามไป */
function greedyMatch(
  webs: ReadImage[],
  slips: ReadImage[],
  accept: (score: number) => boolean,
): Array<[ReadImage, ReadImage]> {
  const candidates: Array<{ web: ReadImage; slip: ReadImage; score: number }> = [];
  for (const web of webs) {
    for (const slip of slips) {
      candidates.push({ web, slip, score: pairScore(web, slip) });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const used = new Set<string>();
  const matched: Array<[ReadImage, ReadImage]> = [];
  for (const candidate of candidates) {
    if (used.has(candidate.web.id) || used.has(candidate.slip.id)) continue;
    if (!accept(candidate.score)) continue;
    used.add(candidate.web.id);
    used.add(candidate.slip.id);
    matched.push([candidate.web, candidate.slip]);
  }
  return matched;
}

/**
 * จับคู่รูปทั้งกองที่อัปโหลดมา
 *
 * รอบแรกจับเฉพาะคู่ที่มั่นใจ (ยอดตรงกัน หรือเวลาใกล้กันมาก) รอบสองค่อยจับที่เหลือ
 * แบบเดาให้ พร้อมติดคำเตือนไว้ ที่เหลือจริง ๆ ปล่อยเป็นรายการเดี่ยวให้คนตัดสินเอง
 */
export function pairImages(images: ReadImage[]): Array<{ web: ReadImage | null; slip: ReadImage | null; guessed: boolean }> {
  const webs = images.filter((image) => image.kind === "web");
  const slips = images.filter((image) => image.kind === "slip");

  const confident = greedyMatch(webs, slips, (score) => score >= 20);
  const taken = new Set(confident.flatMap(([web, slip]) => [web.id, slip.id]));

  const guessed = greedyMatch(
    webs.filter((web) => !taken.has(web.id)),
    slips.filter((slip) => !taken.has(slip.id)),
    () => true,
  );
  for (const [web, slip] of guessed) {
    taken.add(web.id);
    taken.add(slip.id);
  }

  const pairs = [
    ...confident.map(([web, slip]) => ({ web, slip, guessed: false })),
    ...guessed.map(([web, slip]) => ({ web, slip, guessed: true })),
    ...images
      .filter((image) => !taken.has(image.id))
      .map((image) => ({
        web: image.kind === "web" ? image : null,
        slip: image.kind === "slip" ? image : null,
        guessed: false,
      })),
  ];

  // เรียงตามลำดับที่ผู้ใช้เลือกไฟล์มา จะได้ตรวจง่าย
  return pairs.sort((a, b) => orderOf(a) - orderOf(b));
}

function orderOf(pair: { web: ReadImage | null; slip: ReadImage | null }): number {
  const orders = [pair.web?.order, pair.slip?.order].filter((value): value is number => value !== undefined);
  return orders.length > 0 ? Math.min(...orders) : Number.MAX_SAFE_INTEGER;
}

/** รวมค่าจากภาพสองใบให้เป็นรายการเดียว พร้อมคำเตือนตรงจุดที่ทั้งสองใบไม่ตรงกัน */
export function mergePair(input: {
  web: ReadImage | null;
  slip: ReadImage | null;
  guessed?: boolean;
  /** ผู้ใช้เลือกประเภทเอง — บัญชีฝั่งไหนเป็น "ของเรา" จะสลับตามค่านี้ */
  direction?: Direction;
  now?: Date;
}): PairDraft {
  const { web, slip } = input;
  const webFields = web?.web ?? null;
  const slipFields = slip?.slip ?? null;
  const warnings: string[] = [...(web?.warnings ?? []), ...(slip?.warnings ?? [])];

  const direction: Direction =
    input.direction ?? webFields?.direction ?? slipFields?.direction ?? "deposit";

  // ยอดจริงคือยอดบนสลิป ส่วนยอดบนหน้าเว็บคือยอดที่ "แจ้งไว้" — ต่างกันเมื่อไหร่ต้องเตือน
  const amount = slipFields?.amount ?? webFields?.amount ?? null;
  if (
    slipFields?.amount != null &&
    webFields?.amount != null &&
    Math.abs(slipFields.amount - webFields.amount) >= 0.01
  ) {
    warnings.push(
      `ยอดบนหน้าเว็บ (${webFields.amount.toLocaleString("th-TH")}) ไม่ตรงกับยอดบนสลิป ` +
        `(${slipFields.amount.toLocaleString("th-TH")}) — ใช้ยอดจากสลิป`,
    );
  }

  // สลิปคือหลักฐานของเวลาจริง หน้าเว็บใช้ได้เมื่อไม่มีสลิป (หน้ารายการฝาก-ถอนบอกวันเวลาครบ)
  let occurredAtLocal = slipFields?.occurredAtLocal ?? webFields?.occurredAtLocal ?? null;
  if (!occurredAtLocal && webFields?.timeLocal) {
    // หน้าเว็บบอกแต่เวลา ไม่บอกวันที่ — เติมวันที่ของวันนี้ให้ก่อน แล้วให้คนตรวจ
    const today = toDatetimeLocalValue(input.now ?? new Date()).slice(0, 10);
    occurredAtLocal = `${today}T${webFields.timeLocal}`;
    warnings.push("ไม่มีวันที่จากสลิป — เติมวันที่วันนี้ให้ก่อน ตรวจอีกครั้งก่อนบันทึก");
  }

  const gap = timeGap(webFields, slipFields);
  if (gap !== null && gap > 30) {
    warnings.push(`เวลาที่แจ้งบนหน้าเว็บห่างจากเวลาบนสลิป ${gap} นาที — ตรวจว่าจับคู่ถูกใบไหม`);
  }

  if (input.guessed) {
    warnings.push("จับคู่ให้แบบเดา เพราะยอดหรือเวลาไม่ตรงกันพอดี — ตรวจรูปทั้งสองใบก่อนบันทึก");
  }
  if (web && !slip) warnings.push("ยังไม่ได้แนบสลิปธนาคารของรายการนี้");
  if (slip && !web) warnings.push("ยังไม่ได้แนบภาพหน้าเว็บของรายการนี้");

  const duplicate = slip?.duplicate ?? web?.duplicate ?? null;
  if (duplicate) warnings.push("รูปนี้เคยบันทึกไปแล้ว — บันทึกซ้ำไม่ได้");

  // สลิปบอกทั้งสองฝั่งไว้ (ปิดบังบางส่วน) — เอามาเติมช่องที่หน้าเว็บไม่ได้บอก
  const slipSender: AccountRef = {
    bank: slipFields?.bankName ?? null,
    accountNo: slipFields?.senderAccountNo ?? null,
    accountName: slipFields?.senderName ?? null,
  };
  const slipReceiver: AccountRef = {
    bank: null,
    accountNo: slipFields?.counterpartyAccountNo ?? null,
    accountName: slipFields?.counterparty ?? null,
  };

  const fill = (first: AccountRef | null, second: AccountRef): AccountRef => ({
    bank: first?.bank ?? second.bank,
    accountNo: first?.accountNo ?? second.accountNo,
    accountName: first?.accountName ?? second.accountName,
  });

  // ขาฝาก บัญชีเรา = ผู้โอน / ขาถอน บัญชีเรา = ผู้รับ (ธนาคารจาก QR คือธนาคารต้นทางเสมอ)
  const ours = fill(
    webFields ? ourSide(webFields, direction) : null,
    direction === "deposit" ? slipSender : slipReceiver,
  );
  const theirs = fill(
    webFields ? theirSide(webFields, direction) : null,
    direction === "deposit" ? slipReceiver : slipSender,
  );

  return {
    key: `${web?.id ?? ""}|${slip?.id ?? ""}`,
    web,
    slip,
    direction,
    amount,
    occurredAtLocal,
    refNo: slipFields?.refNo ?? null,
    webRefNo: webFields?.refCode ?? null,
    bankName: ours.bank,
    accountNo: ours.accountNo,
    accountName: ours.accountName,
    counterparty: theirs.accountName,
    counterpartyBank: theirs.bank,
    counterpartyAccountNo: theirs.accountNo,
    siteUrl: webFields?.domain ?? null,
    ocrConfidence: slipFields?.confidence ?? (webFields?.amount != null ? 0.5 : 0),
    ocrStatus: amount !== null && occurredAtLocal ? "ocr" : "failed",
    duplicate,
    warnings,
  };
}

/** ชื่อเว็บที่เดาได้จากโดเมน เช่น "chokddd365.run" → "chokddd365" */
export function siteNameFromDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const label = domain.split(".")[0]?.trim();
  return label && label.length >= 2 ? label : null;
}

/** เว็บที่มีอยู่ในระบบ ตัวไหนตรงกับโดเมน/ชื่อที่อ่านได้จากภาพ */
export function resolveSite<T extends { id: string; name: string; domain?: string | null }>(
  sites: T[],
  hints: { domain: string | null; siteHint: string | null },
): T | null {
  const domain = hints.domain?.toLowerCase().replace(/^www\./, "") ?? null;

  if (domain) {
    const byDomain = sites.find(
      (site) => site.domain && site.domain.toLowerCase().replace(/^www\./, "") === domain,
    );
    if (byDomain) return byDomain;

    // ไม่ได้ผูกโดเมนไว้ ก็ดูว่าชื่อเว็บโผล่อยู่ในโดเมนไหม (เช่น เว็บชื่อ "chokddd365")
    const squashedDomain = squash(domain);
    const byName = [...sites]
      .sort((a, b) => b.name.length - a.name.length)
      .find((site) => squash(site.name).length >= 3 && squashedDomain.includes(squash(site.name)));
    if (byName) return byName;
  }

  if (hints.siteHint) {
    const hint = squash(hints.siteHint);
    const matched = sites.find((site) => squash(site.name) === hint);
    if (matched) return matched;
  }

  return null;
}
