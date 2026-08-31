import {
  AMOUNT_LABELS,
  EXCLUDED_LABELS,
  findBank,
  includesAny,
  matchSiteName,
  normalizeThaiText,
  saneDate,
  squash,
  toLines,
  type Line,
} from "./ocr-text";
import { parseLooseDateTime, toDatetimeLocalValue } from "./thai-date";
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

/**
 * หน้าเว็บเรียกยอดว่า "เครดิต" — คำนี้อยู่ในรายการต้องห้ามของสลิป (เพราะ "เครดิตคงเหลือ")
 * จึงต้องปลดออกเฉพาะที่นี่ แล้วกันยอดคงเหลือด้วยคำว่า "คงเหลือ" ซึ่งยังห้ามอยู่
 */
const WEB_AMOUNT_LABELS = [...AMOUNT_LABELS, "จำนวนเครดิต", "ยอดเครดิต", "เครดิตที่โอน", "จำนวนที่ฝาก"];
const WEB_EXCLUDED_LABELS = EXCLUDED_LABELS.filter((label) => label !== "เครดิต");

/** ป้ายที่ไม่ใช่ชื่อคนแน่ ๆ — กันบรรทัดอย่าง "หมายเหตุ:" ถูกหยิบมาเป็นชื่อบัญชี */
const NOT_A_NAME = [...ACCOUNT_NAME_LABELS, "ธนาคาร", "บัญชี", "copy", "คัดลอก", "หมายเหตุ", "สถานะ", "อนุมัติ", "รายการ"];

/** ชื่อคนที่มีคำนำหน้า — จับได้แม้อยู่ปนกับข้อความอื่นในบรรทัดเดียวกัน */
const TITLED_NAME_RE = /((?:นางสาว|นาย|นาง|น\.ส\.|ด\.ช\.|ด\.ญ\.|คุณ|บจก\.|บริษัท)\s*[ก-๙A-Za-z][ก-๙A-Za-z.\s]{2,60})/;

// เว็บสะกด "เครดิต" ไม่เหมือนกัน (บางเว็บพิมพ์ "ครดิต") จึงใส่ทั้งสองแบบ
const DEPOSIT_HEADINGS = [
  "ฝากเงิน", "แจ้งฝาก", "เติมเงิน", "เติมเครดิต", "เติมครดิต", "ฝากเครดิต", "deposit", "topup",
];
const WITHDRAW_HEADINGS = [
  "ถอนเงิน", "แจ้งถอน", "ถอนเครดิต", "ถอนครดิต", "ขอถอน", "withdraw",
];

/** คำที่เจอเฉพาะบนหน้าเว็บ ไม่เจอบนสลิปธนาคาร — ใช้แยกว่ารูปไหนเป็นรูปอะไร */
const WEB_MARKERS = [
  "โอนจากบัญชีนี้เท่านั้น", "โอนถึงบัญชี", "เวลาโอน", "ชั่วโมงที่โอนเงิน", "นาทีที่โอนเงิน",
  "แนบไฟล์", "แนบสลิป", "หน้าหลัก", "โอนก่อนหมดเวลา", "เติมเครดิต", "ถอนเครดิต",
  "เครดิตคงเหลือ", "กระเป๋าเงิน", "ยอดเครดิต", "copy",
  "รายการฝากถอน", "จำนวนเครดิต", "เติมครดิต", "ถอนครดิต", "อนุมัติ", "หมายเหตุ",
];

/** โดเมนที่ไม่ใช่เว็บหวย — เจอบนภาพได้จากแถบเบราว์เซอร์หรือปุ่มแชร์ */
const IGNORED_DOMAINS = [
  "line.me", "gmail.com", "google.com", "facebook.com", "youtube.com",
  "apple.com", "t.me", "wa.me", "bit.ly", "w3.org",
];

/**
 * นามสกุลโดเมนที่เว็บพวกนี้ใช้กันจริง — ต้องมีรายการไว้ ไม่งั้นข้อความอย่าง
 * "order.completed" หรือ "cmt6.abcdefgh" จะถูกอ่านเป็นโดเมนไปด้วย
 * ที่ไม่อยู่ในรายการยังผ่านได้ถ้าเป็นนามสกุลสั้น ๆ (2–3 ตัว) แบบ ccTLD
 */
const KNOWN_TLDS = new Set([
  "com", "net", "org", "run", "bet", "vip", "club", "win", "app", "live", "game",
  "fun", "biz", "info", "xyz", "site", "online", "store", "shop", "asia", "team",
  "pro", "one", "plus", "today", "world", "link", "life", "top", "space", "website",
]);

/**
 * โดเมนบนภาพ — รับชื่อภาษาไทยด้วย (ถูกเบอร์.net) แต่บังคับให้นามสกุลเป็นอังกฤษหรือ .ไทย
 * ถ้าปล่อยให้นามสกุลเป็นภาษาไทยอะไรก็ได้ คำอย่าง "น.ส." หรือ "ธ.ก.ส." จะกลายเป็นโดเมน
 */
const DOMAIN_RE =
  /(?<![\p{L}\p{N}\p{M}@.])((?:[\p{L}\p{N}][\p{L}\p{N}\p{M}-]{0,40}\.)+(?:[a-z]{2,10}|ไทย))(?![\p{L}\p{N}\p{M}])/giu;

/** รหัสรายการที่เว็บออกให้ ขึ้นต้นด้วย QR แล้วตามด้วยตัวเลขยาว ๆ */
const WEB_REF_RE = /\bQR[\s-]?(\d{8,24})\b/i;

/** อีกแบบที่เจอในหมายเหตุของรายการ เช่น "REF: W-1279213471506" */
const SITE_REF_RE = /\bREF[:\s]*([A-Za-z]{0,3}-?\d{8,24})\b/i;

/** เวลาแบบ HH:MM ที่ไม่ใช่ส่วนหนึ่งของนาฬิกานับถอยหลัง (HH:MM:SS) */
const CLOCK_RE = /(?<![\d:])([01]?\d|2[0-3]):([0-5]\d)(?![\d:])/;

/** เลขบัญชีธนาคาร 9–15 หลัก จะพิมพ์ติดกันหรือคั่นด้วยขีดก็ได้ */
const ACCOUNT_NO_RE = /(?<![\d-])(\d[\d-]{7,18}\d)(?![\d-])/;

/** ยอดติดลบบนหน้าเว็บ เช่น "-7,000.00" — ตัวจับเลขกลางไม่รับขีดนำหน้า จึงต้องปาดออกก่อน */
const NEGATIVE_AMOUNT_RE = /(^|[\s(])[-−]\s?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2})/gm;

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
  if (includesAny(line.squashed, NOT_A_NAME)) return false;
  return findBank(line.squashed) === null;
}

/** อักขระประดับที่บางเว็บใส่คร่อมชื่อบัญชี เช่น "//+++ชนินทร์ ศิริบุตร+++//" */
const DECOR_HEAD_RE = /^[\s/+*=~_.\-]+/;
const DECOR_TAIL_RE = /[\s/+*=~_\-]+$/;
const WRAP_HEAD_RE = /^[/+*=~_.\-]{2,}/;
const WRAP_TAIL_RE = /[/+*=~_\-]{2,}$/;

function cleanName(text: string): string {
  return text.replace(DECOR_HEAD_RE, "").replace(DECOR_TAIL_RE, "").trim().slice(0, 200);
}

/**
 * ชื่อบัญชีที่บรรทัดนี้ — การ์ดแคบ ๆ ตัดชื่อขึ้นบรรทัดใหม่กลางคำได้
 * เปิดด้วยอักขระประดับแล้วยังไม่ปิดในบรรทัดเดียวกัน แปลว่าชื่อยังไม่จบ ต่อบรรทัดถัดไปให้
 * ("//+++ชนินทร์ ศิริ" + "บุตร+++//" → "ชนินทร์ ศิริบุตร")
 */
function nameAt(lines: Line[], index: number): string | null {
  const line = lines[index];
  if (!looksLikeName(line)) return null;

  const next = lines[index + 1];
  const wrapped =
    WRAP_HEAD_RE.test(line.text) &&
    !WRAP_TAIL_RE.test(line.text) &&
    Boolean(next) &&
    !/\d/.test(next.text) &&
    WRAP_TAIL_RE.test(next.text);

  const cleaned = cleanName(wrapped ? `${line.text}${next.text}` : line.text);
  return cleaned.length >= 3 ? cleaned : null;
}

/** ค่าที่เขียนต่อท้ายป้ายบนบรรทัดเดียวกัน เช่น "ชื่อบัญชี : สหภูมิ ฟองเมฆ" */
function valueAfterLabel(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const at = squash(text).indexOf(label);
    if (at !== 0) continue;
    // เทียบตำแหน่งบนข้อความจริงไม่ได้ตรง ๆ เพราะ squash ตัดอักขระทิ้ง — ตัดด้วย regex แทน
    const rest = text.replace(/^[^\s:：]*[\s:：]*/, "").trim();
    if (rest && !/\d/.test(rest) && rest.length >= 3) return cleanName(rest);
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
        // หน้าเว็บบางแบบวาง "ชื่อบัญชี:" กับ "เลขที่บัญชี:" ติดกันแล้วค่อยตามด้วยค่าทั้งคู่
        for (let next = index + 1; next < Math.min(index + 4, lines.length); next += 1) {
          accountName = nameAt(lines, next);
          if (accountName) break;
        }
      }
    }
  }

  // ชื่อที่มีคำนำหน้า ("+น.ส. ภัทธา พรรณสมัย+") ชัดเจนพอที่จะหยิบได้แม้อยู่ปนกับข้อความอื่น
  // หน้ารายการฝาก-ถอนวางชื่อไว้เหนือเลขบัญชี จึงต้องมองขึ้นไปเหนือช่วงด้วย
  if (accountName === null) {
    const titledAt = (index: number): string | null => {
      const titled = lines[index]?.text.match(TITLED_NAME_RE)?.[1];
      return titled ? cleanName(titled) : null;
    };
    const below = accountNoAt >= 0 ? accountNoAt + 1 : start;
    for (let index = below; accountName === null && index < stop; index += 1) {
      accountName = titledAt(index);
    }
    for (let index = below - 1; accountName === null && index >= Math.max(0, start - 3); index -= 1) {
      accountName = titledAt(index);
    }
  }

  // ไม่มีป้าย "ชื่อบัญชี" ให้เกาะ — เอาบรรทัดที่หน้าตาเหมือนชื่อคน โดยเริ่มหาจากใต้เลขบัญชีก่อน
  // (หน้าเว็บวางชื่อไว้ใต้เลขบัญชีเสมอ ถ้าไล่จากบนจะไปหยิบชื่อของบัญชีก้อนก่อนหน้ามา)
  if (accountName === null) {
    const scan = (from: number, to: number): string | null => {
      for (let index = from; index < to; index += 1) {
        const found = nameAt(lines, index);
        if (found) return found;
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

    // มีบัญชีเดียวทั้งหน้า (หน้ารายการฝาก-ถอนของเว็บเป็นแบบนี้) — กวาดทั้งหน้าได้เลย
    // ไม่งั้นป้าย "ชื่อบัญชี:" ที่อยู่เหนือเลขบัญชีจะหลุดออกนอกกรอบ
    // มีหลายบัญชีค่อยตีกรอบ: เริ่มที่บรรทัดเลขบัญชี หยุดก่อนเลขบัญชีถัดไป
    const single = at.length === 1;
    const stop = single ? lines.length : Math.min(index + 4, at[position + 1] ?? lines.length);
    const block = readAccountBlock(lines, single ? 0 : index, Math.min(stop, lines.length));
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
    if (includesAny(line.squashed, WEB_EXCLUDED_LABELS)) continue;

    const labeledHere = includesAny(line.squashed, WEB_AMOUNT_LABELS);
    const previous = index > 0 ? lines[index - 1] : null;
    const labeledAbove = Boolean(
      previous &&
        previous.numbers.length === 0 &&
        includesAny(previous.squashed, WEB_AMOUNT_LABELS) &&
        !includesAny(previous.squashed, WEB_EXCLUDED_LABELS),
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
    const tld = domain.split(".").pop() ?? "";
    if (tld !== "ไทย" && !KNOWN_TLDS.has(tld) && tld.length > 3) continue;
    return domain;
  }
  return null;
}

/**
 * วันเวลาเต็มบนหน้าเว็บ (หน้ารายการฝาก-ถอนมีให้ เช่น "26-Aug-2026 07:18")
 * ตัดเลขบัญชีออกก่อน เพราะ "232-2-87048-4" หลอกให้ตัวอ่านวันที่ทำงานพลาดได้
 */
function findDate(lines: Line[], now: Date): Date | null {
  let fallback: Date | null = null;

  for (const line of lines) {
    // ปาดเลขบัญชีกับยอดเงินออกก่อน — ทั้งสองอย่างหลอกให้ตัวอ่านวันที่ทำงานพลาดได้
    const cleaned = line.text
      .replace(ACCOUNT_NO_RE, " ")
      .replace(/\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d+\.\d{2}/g, " ");
    const parsed = saneDate(parseLooseDateTime(cleaned), now);
    if (!parsed) continue;
    // บรรทัดที่มีเวลากำกับมาด้วยชนะเสมอ — นาฬิกาบนแถบสถานะไม่มีวันที่จึงไม่เข้าเงื่อนไขนี้
    if (CLOCK_RE.test(cleaned)) return parsed;
    fallback ??= parsed;
  }

  return fallback;
}

/**
 * เวลาของรายการ เรียงตามความน่าเชื่อถือ
 *   1. ช่องชั่วโมง/นาทีที่ผู้ใช้กรอกไว้เอง
 *   2. เวลาที่ติดมากับวันที่ของรายการ
 *   3. นาฬิกาตัวแรกบนภาพ — เดาสุดท้าย เพราะอาจเป็นนาฬิกาบนแถบสถานะของมือถือ
 */
function findTime(lines: Line[], text: string, occurredAt: Date | null): string | null {
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

  if (occurredAt) return toDatetimeLocalValue(occurredAt).slice(11);

  const clock = text.match(CLOCK_RE);
  return clock ? `${clock[1].padStart(2, "0")}:${clock[2]}` : null;
}

/** ป้ายบนตัวรายการเอง — ชนะหัวข้อของหน้าเสมอ (หน้า "สถานะฝากเงิน" โชว์รายการถอนได้) */
const RECORD_WITHDRAW = ["ถอนเครดิต", "ถอนครดิต", "ถอนเงิน", "แจ้งถอน"];
const RECORD_DEPOSIT = ["เติมเครดิต", "เติมครดิต", "ฝากเครดิต", "เติมเงิน", "แจ้งฝาก"];

function findDirection(lines: Line[], hasNegativeAmount: boolean): Direction | null {
  // ป้ายในการ์ดตัดบรรทัดได้ ("ถอน" ขึ้นบรรทัดใหม่แล้วต่อด้วย "เครดิต") จึงต้องต่อบรรทัดคู่กันดู
  for (let index = 0; index < lines.length; index += 1) {
    const joined = lines[index].squashed + (lines[index + 1]?.squashed ?? "");
    if (includesAny(joined, RECORD_WITHDRAW)) return "withdraw";
    if (includesAny(joined, RECORD_DEPOSIT)) return "deposit";
  }

  // ยอดติดลบบนหน้ารายการของเว็บ = เงินออกจากเว็บ
  if (hasNegativeAmount) return "withdraw";

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
  options: { siteNames?: string[]; now?: Date } = {},
): WebPageResult {
  const now = options.now ?? new Date();
  const raw = normalizeThaiText(rawText);

  // ยอดติดลบ ("-7,000.00") ต้องปาดเครื่องหมายออกก่อนถึงจะถูกนับเป็นตัวเลข
  // แต่เครื่องหมายนั้นคือคำใบ้ว่าเป็นเงินออกจากเว็บ จึงจำไว้ก่อนปาดทิ้ง
  const hasNegativeAmount = NEGATIVE_AMOUNT_RE.test(raw);
  NEGATIVE_AMOUNT_RE.lastIndex = 0;
  const text = raw.replace(NEGATIVE_AMOUNT_RE, "$1$2");

  const lines = toLines(text);
  const webRef = text.match(WEB_REF_RE);
  const siteRef = text.match(SITE_REF_RE);

  const { from, to } = findAccounts(lines);
  // มีบัญชีเดียวบนหน้าจอแต่ไม่รู้ธนาคาร — ชื่อธนาคารที่โผล่บนหน้าย่อมเป็นของบัญชีนั้น
  const only = from && to ? null : (from ?? to);
  if (only && !only.bank) only.bank = findBank(squash(text));

  const occurredAt = findDate(lines, now);

  return {
    direction: findDirection(lines, hasNegativeAmount),
    amount: findWebAmount(lines),
    fromAccount: from,
    toAccount: to,
    domain: findDomain(text),
    refCode: webRef ? `QR-${webRef[1]}` : (siteRef?.[1]?.toUpperCase() ?? null),
    timeLocal: findTime(lines, text, occurredAt),
    occurredAtLocal: occurredAt ? toDatetimeLocalValue(occurredAt) : null,
    siteHint: options.siteNames ? matchSiteName(text, options.siteNames) : null,
  };
}
