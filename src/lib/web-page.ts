import {
  AMOUNT_LABELS,
  EXCLUDED_LABELS,
  findBank,
  includesAny,
  matchSiteName,
  normalizeThaiText,
  squash,
  toLines,
  type Line,
} from "./ocr-text";
import type { AccountRef, Direction, WebPageResult } from "./types";

/**
 * แยกฟิลด์ออกจากภาพ "หน้าฝาก/ถอนเงินของเว็บ" — คนละแบบกับสลิปธนาคาร
 *
 * หน้าพวกนี้ไม่มี QR ตรวจสอบสลิปให้ถอด แต่บอกสิ่งที่สลิปไม่มี คือ
 *   - เว็บไหน (โดเมนที่มุมล่าง)
 *   - บัญชีที่ต้องโอนออก และบัญชีปลายทาง พร้อมชื่อเจ้าของบัญชี
 *   - ยอดที่แจ้งไว้ กับรหัสรายการของเว็บ (QR-xxxxxxxx)
 * เอามาคู่กับสลิปแล้วได้รายการที่ครบกว่าอ่านจากภาพเดียว
 *
 * ไฟล์นี้ไม่ยุ่งกับเน็ต ทดสอบด้วยข้อความดิบได้ตรง ๆ (scripts/pair-check.ts)
 */

/** ป้ายบอกว่าบล็อกถัดไปคือบัญชีต้นทาง (บัญชีที่เงินออก) */
const FROM_ANCHORS = [
  "โอนจากบัญชีนี้เท่านั้น", "โอนจากบัญชีนี้", "โอนจากบัญชี", "โอนออกจากบัญชี",
  "บัญชีที่โอนออก", "บัญชีต้นทาง", "จากบัญชี",
];

/** ป้ายบอกว่าบล็อกถัดไปคือบัญชีปลายทาง (บัญชีที่เงินเข้า) */
const TO_ANCHORS = [
  "โอนถึงบัญชี", "โอนเข้าบัญชี", "โอนไปยังบัญชี", "ถอนเข้าบัญชี",
  "บัญชีปลายทาง", "บัญชีรับเงิน", "รับเงินเข้าบัญชี", "เข้าบัญชี",
];

const ACCOUNT_NAME_LABELS = ["ชื่อบัญชี", "ชื่อเจ้าของบัญชี", "accountname"];

const DEPOSIT_HEADINGS = ["ฝากเงิน", "แจ้งฝาก", "เติมเงิน", "เติมเครดิต", "deposit", "topup"];
const WITHDRAW_HEADINGS = ["ถอนเงิน", "แจ้งถอน", "ถอนเครดิต", "ขอถอน", "withdraw"];

/** คำที่เจอเฉพาะบนหน้าเว็บ ไม่เจอบนสลิปธนาคาร — ใช้แยกว่ารูปไหนเป็นรูปอะไร */
const WEB_MARKERS = [
  "โอนจากบัญชีนี้เท่านั้น", "โอนถึงบัญชี", "เวลาโอน", "ชั่วโมงที่โอนเงิน", "นาทีที่โอนเงิน",
  "แนบไฟล์", "แนบสลิป", "หน้าหลัก", "โอนก่อนหมดเวลา", "เติมเครดิต", "ถอนเครดิต",
  "เครดิตคงเหลือ", "กระเป๋าเงิน", "ยอดเครดิต", "copy",
];

/** โดเมนที่ไม่ใช่เว็บหวย — เจอบนภาพได้จากแถบเบราว์เซอร์หรือปุ่มแชร์ */
const IGNORED_DOMAINS = [
  "line.me", "gmail.com", "google.com", "facebook.com", "youtube.com",
  "apple.com", "t.me", "wa.me", "bit.ly", "w3.org",
];

const DOMAIN_RE = /\b((?:[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?\.)+[a-z]{2,10})\b/gi;

/** รหัสรายการที่เว็บออกให้ ขึ้นต้นด้วย QR แล้วตามด้วยตัวเลขยาว ๆ */
const WEB_REF_RE = /\bQR[\s-]?(\d{8,24})\b/i;

/** เวลาแบบ HH:MM ที่ไม่ใช่ส่วนหนึ่งของนาฬิกานับถอยหลัง (HH:MM:SS) */
const CLOCK_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;

/** เลขบัญชีธนาคาร 9–15 หลัก จะพิมพ์ติดกันหรือคั่นด้วยขีดก็ได้ */
const ACCOUNT_NO_RE = /(?<![\d-])(\d[\d-]{7,18}\d)(?![\d-])/;

function accountNoFrom(text: string): string | null {
  const raw = text.match(ACCOUNT_NO_RE)?.[1];
  if (!raw) return null;
  const digits = raw.replace(/-/g, "");
  return digits.length >= 9 && digits.length <= 15 ? digits : null;
}

/** บรรทัดนี้เป็นชื่อคน/ชื่อบัญชีได้ไหม — ป้ายกำกับกับบรรทัดที่มีตัวเลขไม่ใช่ */
function looksLikeName(line: Line): boolean {
  if (line.numbers.length > 0 || /\d/.test(line.text)) return false;
  const letters = line.text.replace(/[^A-Za-z฀-๿]/g, "");
  if (letters.length < 3) return false;
  if (includesAny(line.squashed, [...ACCOUNT_NAME_LABELS, "ธนาคาร", "บัญชี", "copy", "คัดลอก"])) {
    return false;
  }
  return findBank(line.squashed) === null;
}

/** ค่าที่เขียนต่อท้ายป้ายบนบรรทัดเดียวกัน เช่น "ชื่อบัญชี : สหภูมิ ฟองเมฆ" */
function valueAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const at = squash(text).indexOf(label);
    if (at !== 0) continue;
    // เทียบตำแหน่งบนข้อความจริงไม่ได้ตรง ๆ เพราะ squash ตัดอักขระทิ้ง — ตัดด้วย regex แทน
    const rest = text.replace(/^[^\s:：]*[\s:：]*/, "").trim();
    if (rest && !/\d/.test(rest) && rest.length >= 3) return rest.slice(0, 200);
  }
  return null;
}

function anchorRole(line: Line): "from" | "to" | null {
  if (includesAny(line.squashed, FROM_ANCHORS)) return "from";
  if (includesAny(line.squashed, TO_ANCHORS)) return "to";
  return null;
}

/**
 * อ่านบล็อกบัญชีในช่วงบรรทัดที่กำหนด
 * หน้าเว็บวางเรียงกันเป็นชุด: ชื่อธนาคาร → เลขบัญชี → "ชื่อบัญชี" → ชื่อเจ้าของ
 * แต่ Vision อาจสลับลำดับได้ จึงเก็บทีละอย่างจากทั้งหน้าต่างแทนการอ่านตามตำแหน่ง
 */
function readAccountBlock(lines: Line[], start: number, stop: number): AccountRef | null {
  let accountNo: string | null = null;
  let accountNoAt = -1;
  let accountName: string | null = null;

  for (let index = start; index < stop; index += 1) {
    const line = lines[index];
    if (accountNo === null) {
      accountNo = accountNoFrom(line.text);
      if (accountNo !== null) accountNoAt = index;
    }

    if (accountName === null) {
      const inline = valueAfterLabel(line.text, ACCOUNT_NAME_LABELS);
      if (inline) accountName = inline;
      else if (includesAny(line.squashed, ACCOUNT_NAME_LABELS)) {
        const next = lines[index + 1];
        if (next && looksLikeName(next)) accountName = next.text.slice(0, 200);
      }
    }
  }

  // ไม่มีป้าย "ชื่อบัญชี" ให้เกาะ — เอาบรรทัดที่หน้าตาเหมือนชื่อคน โดยเริ่มหาจากใต้เลขบัญชีก่อน
  // (หน้าเว็บวางชื่อไว้ใต้เลขบัญชีเสมอ ถ้าไล่จากบนจะไปหยิบชื่อของบัญชีก้อนก่อนหน้ามา)
  if (accountName === null) {
    const scan = (from: number, to: number): string | null => {
      for (let index = from; index < to; index += 1) {
        if (looksLikeName(lines[index])) return lines[index].text.slice(0, 200);
      }
      return null;
    };
    const below = accountNoAt >= 0 ? accountNoAt + 1 : start;
    accountName = scan(below, stop) ?? scan(start, below);
  }

  // ชื่อธนาคารที่ "ใกล้เลขบัญชีที่สุด" คือของบัญชีก้อนนี้ — เผื่อขึ้นไปเหนือช่วงด้วย 3 บรรทัด
  // เพราะโลโก้ธนาคารมักถูกอ่านได้ก่อนป้าย (เช่น "SCB" อยู่เหนือ "โอนจากบัญชีนี้เท่านั้น")
  let bank: string | null = null;
  let bankDistance = Number.MAX_SAFE_INTEGER;
  for (let index = Math.max(0, start - 3); index < stop; index += 1) {
    const found = findBank(lines[index].squashed);
    if (!found) continue;
    // ไม่มีเลขบัญชีให้ยึด ก็เอาชื่อแรกที่เจอ
    const distance = accountNoAt >= 0 ? Math.abs(index - accountNoAt) * 2 + (index > accountNoAt ? 1 : 0) : index;
    if (distance < bankDistance) {
      bank = found;
      bankDistance = distance;
    }
  }

  if (!bank && !accountNo && !accountName) return null;
  return { bank, accountNo, accountName };
}

/**
 * หาก้อนบัญชีโดยไม่ต้องมีป้ายบอกฝั่ง — ยึดบรรทัดที่มีเลขบัญชีเป็นศูนย์กลางแล้วกวาดรอบ ๆ
 * ใช้เป็นทางสำรองเมื่อ Vision จัดลำดับไม่เหมือนที่ตาเห็น จนป้ายกับค่าหลุดจากกัน
 */
function clusterAccounts(lines: Line[]): AccountRef[] {
  const at = lines
    .map((line, index) => (accountNoFrom(line.text) ? index : -1))
    .filter((index) => index >= 0);

  const clusters: AccountRef[] = [];
  const seen = new Set<string>();

  for (let position = 0; position < at.length; position += 1) {
    const index = at[position];
    const accountNo = accountNoFrom(lines[index].text)!;
    if (seen.has(accountNo)) continue;
    seen.add(accountNo);

    // เริ่มที่บรรทัดเลขบัญชีและหยุดก่อนเลขบัญชีถัดไป จะได้ไม่คาบเกี่ยวกับบัญชีก้อนอื่น
    // (ชื่อธนาคารที่อยู่เหนือเลขบัญชี readAccountBlock ถอยขึ้นไปหาให้เองอยู่แล้ว)
    const stop = Math.min(index + 4, at[position + 1] ?? lines.length, lines.length);
    const block = readAccountBlock(lines, index, stop);
    if (block) clusters.push({ ...block, accountNo });
  }

  return clusters;
}

function findAccounts(lines: Line[]): { from: AccountRef | null; to: AccountRef | null } {
  const anchors = lines
    .map((line, index) => ({ index, role: anchorRole(line) }))
    .filter((item): item is { index: number; role: "from" | "to" } => item.role !== null);

  let from: AccountRef | null = null;
  let to: AccountRef | null = null;

  for (let position = 0; position < anchors.length; position += 1) {
    const anchor = anchors[position];
    const nextAnchor = anchors[position + 1]?.index ?? lines.length;
    const stop = Math.min(anchor.index + 9, nextAnchor, lines.length);
    const block = readAccountBlock(lines, anchor.index + 1, stop);
    if (!block) continue;
    if (anchor.role === "from") from ??= block;
    else to ??= block;
  }

  if (!from || !to) {
    const clusters = clusterAccounts(lines);
    const hasFromAnchor = anchors.some((anchor) => anchor.role === "from");

    if (!from && !to) {
      // ไม่มีป้ายบอกบทบาทเลย — บัญชีเดียวถือว่าเป็นปลายทาง สองบัญชีถือว่าเรียงบนลงล่าง
      if (clusters.length === 1) to = clusters[0];
      else if (clusters.length >= 2) [from, to] = [clusters[0], clusters[1]];
    } else if (!from && hasFromAnchor && clusters.length >= 2) {
      // มีป้าย "โอนจากบัญชีนี้" แต่ในหน้าต่างไม่มีบัญชีเลย แปลว่า Vision กองป้ายไว้ด้วยกัน
      // ค่าที่จับมาได้จึงเลื่อนไปหนึ่งช่อง — ยึดลำดับบนลงล่างของหน้าจอแทน
      [from, to] = [clusters[0], clusters[1]];
    } else if (!to) {
      to = clusters.find((cluster) => cluster.accountNo !== from?.accountNo) ?? to;
    }
  }

  return { from, to };
}

/**
 * หายอดที่หน้าเว็บแจ้งไว้
 * ให้คะแนนแบบเดียวกับสลิป แต่ตัดเลขบัญชี (ยาว 9 หลักขึ้นไปไม่มีจุด) และช่องชั่วโมง/นาที
 * (เลขโดด ๆ ไม่มีคอมมาไม่มีจุด) ออกก่อน เพราะหน้าเว็บมีเลขพวกนี้เต็มไปหมด
 */
function findWebAmount(lines: Line[]): number | null {
  let best: { value: number; score: number } | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (includesAny(line.squashed, EXCLUDED_LABELS)) continue;

    const labeledHere = includesAny(line.squashed, AMOUNT_LABELS);
    const previous = index > 0 ? lines[index - 1] : null;
    const labeledAbove = Boolean(
      previous &&
        previous.numbers.length === 0 &&
        includesAny(previous.squashed, AMOUNT_LABELS) &&
        !includesAny(previous.squashed, EXCLUDED_LABELS),
    );
    const hasCurrency = includesAny(line.squashed, ["บาท", "thb"]) || line.text.includes("฿");

    for (const { raw, value } of line.numbers) {
      if (value <= 0 || value > 10_000_000) continue;
      const plain = raw.replace(/[,.]/g, "");
      // เลขยาวไม่มีคอมมาไม่มีจุด = เลขบัญชี / รหัสรายการ ไม่ใช่ยอดเงิน
      if (plain.length >= 9 && !/[,.]/.test(raw)) continue;

      let score = 0;
      if (labeledHere) score += 5;
      if (labeledAbove) score += 4;
      if (hasCurrency) score += 2;
      if (/\.\d{2}$/.test(raw)) score += 2;
      if (raw.includes(",")) score += 1;
      // เลขโดด ๆ ไม่มีอะไรกำกับ เชื่อไม่ได้ — หน้าเว็บมีทั้งเลขนาฬิกาและเลขรายการเต็มไปหมด
      if (!labeledHere && !labeledAbove && !hasCurrency && !/[,.]/.test(raw)) score -= 2;

      if (score <= 0) continue;
      if (best === null || score > best.score) best = { value, score };
    }
  }

  return best === null ? null : Math.round(best.value * 100) / 100;
}

function findDomain(text: string): string | null {
  for (const match of text.matchAll(DOMAIN_RE)) {
    const domain = match[1].toLowerCase().replace(/^www\./, "");
    if (IGNORED_DOMAINS.some((ignored) => domain === ignored || domain.endsWith(`.${ignored}`))) {
      continue;
    }
    return domain;
  }
  return null;
}

/** เวลาที่กรอกไว้ในหน้าเว็บ — ช่องชั่วโมง/นาทีมาก่อน แล้วค่อยดูนาฬิกาบนภาพ */
function findTime(lines: Line[], text: string): string | null {
  const pick = (labels: string[], max: number): number | null => {
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!includesAny(line.squashed, labels)) continue;
      const here = line.numbers[0] ?? lines[index + 1]?.numbers[0];
      if (here && Number.isInteger(here.value) && here.value >= 0 && here.value <= max) {
        return here.value;
      }
    }
    return null;
  };

  const hour = pick(["ชั่วโมงที่โอนเงิน", "ชั่วโมงที่โอน", "ชั่วโมง"], 23);
  const minute = pick(["นาทีที่โอนเงิน", "นาทีที่โอน", "นาที"], 59);
  if (hour !== null && minute !== null) {
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const clock = text.match(CLOCK_RE);
  return clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : null;
}

function findDirection(lines: Line[]): Direction | null {
  for (const line of lines) {
    if (includesAny(line.squashed, WITHDRAW_HEADINGS)) return "withdraw";
    if (includesAny(line.squashed, DEPOSIT_HEADINGS)) return "deposit";
  }
  // ไม่มีหัวข้อให้ดู แต่หน้าที่สั่งให้ "โอนจากบัญชีนี้" คือหน้าฝากเงินเสมอ
  return lines.some((line) => includesAny(line.squashed, FROM_ANCHORS)) ? "deposit" : null;
}

/** คะแนนความเป็น "หน้าเว็บ" ของข้อความ — ใช้แยกรูปหน้าเว็บออกจากสลิปธนาคาร */
export function webPageScore(rawText: string): number {
  const text = normalizeThaiText(rawText);
  const squashed = squash(text);
  let score = WEB_MARKERS.filter((marker) => squashed.includes(marker)).length * 2;
  if (findDomain(text)) score += 3;
  if (WEB_REF_RE.test(text)) score += 3;
  return score;
}

/** อ่านฟิลด์ทั้งหมดจากภาพหน้าฝาก/ถอนของเว็บ */
export function extractWebPageFields(
  rawText: string,
  options: { siteNames?: string[] } = {},
): WebPageResult {
  const text = normalizeThaiText(rawText);
  const lines = toLines(text);
  const { from, to } = findAccounts(lines);
  const webRef = text.match(WEB_REF_RE);

  return {
    direction: findDirection(lines),
    amount: findWebAmount(lines),
    fromAccount: from,
    toAccount: to,
    domain: findDomain(text),
    refCode: webRef ? `QR-${webRef[1]}` : null,
    timeLocal: findTime(lines, text),
    siteHint: options.siteNames ? matchSiteName(text, options.siteNames) : null,
  };
}
