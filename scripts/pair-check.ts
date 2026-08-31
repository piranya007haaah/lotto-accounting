/**
 * ตรวจกติกาการอ่าน "หน้าฝาก/ถอนของเว็บ" และการจับคู่กับสลิป โดยไม่ต้องเรียก API จริง
 *
 *   npx tsx scripts/pair-check.ts
 *
 * เคสแรกเป็นข้อความจากภาพหน้าฝากเงินจริง (เรียงบรรทัดตามที่ Vision อ่านจากบนลงล่าง)
 * — อย่าแก้ข้อความ ใช้เป็นหลักฐานว่ากติกายังอ่านถูกอยู่
 */
import { classifyDocument, mergePair, pairImages, resolveSite, type ReadImage } from "../src/lib/pairing";
import { extractWebPageFields } from "../src/lib/web-page";
import { extractSlipFields } from "../src/lib/slip-text";
import { toDatetimeLocalValue } from "../src/lib/thai-date";
import type { OcrResult } from "../src/lib/types";

const DEPOSIT_PAGE = `14:34
$ ฝากเงิน โอนผ่านธนาคาร
หน้าหลัก
SCB
โอนจากบัญชีนี้เท่านั้น
ธนาคารไทยพาณิชย์
5502761877
ชื่อบัญชี
สหภูมิ ฟองเมฆ
โอนผ่านธนาคารบัญชีนี้เท่านั้น
โอนถึงบัญชี
copy
เกียรตินาคินภัทร
207950702
ชื่อบัญชี
ปาริชาต ปราบหงส์
QR-2737703011042845
1,000.00
โอนก่อนหมดเวลา ถ้าหมดเวลาห้ามโอนทุกกรณี
00:09:54
เวลาโอน
ชั่วโมงที่โอนเงิน
14
นาทีที่โอนเงิน
34
* กรุณากรอก วัน-เวลา ในการโอนให้ตรงกับ Slip ระบบจะเติมเครดิตให้คุณอัตโนมัติ
แนบไฟล์ (สลิป)
chokddd365.run
กรุณาแนบสลิป
ภาพสลิปต้องมี QR Code ของรายการโอนเงิน`;

const WITHDRAW_PAGE = `ถอนเงิน ผ่านธนาคาร
หน้าหลัก
แจ้งถอนเครดิต
ถอนเข้าบัญชี
ธนาคารกสิกรไทย
1234567890
ชื่อบัญชี
สหภูมิ ฟองเมฆ
จำนวนเงิน
2,500.00
เครดิตคงเหลือ 8,120.00
เวลาโอน
ชั่วโมงที่โอนเงิน
09
นาทีที่โอนเงิน
05
huaydee888.com`;

/** Vision บางครั้งกองป้ายฝั่งซ้ายไว้ด้วยกันก่อน แล้วค่อยตามด้วยค่าของทั้งสองการ์ด */
const SHUFFLED_PAGE = `ฝากเงิน โอนผ่านธนาคาร
โอนจากบัญชีนี้เท่านั้น
โอนถึงบัญชี
ชื่อบัญชี
ชื่อบัญชี
SCB
ธนาคารไทยพาณิชย์
5502761877
สหภูมิ ฟองเมฆ
เกียรตินาคินภัทร
207950702
ปาริชาต ปราบหงส์
QR-2737703011042845
1,000.00
chokddd365.run`;

const SLIP_TEXT = `SCB
โอนเงินสำเร็จ
30 ส.ค. 2569 - 14:36 น.
จาก
นาย สหภูมิ ฟ.
ธนาคารไทยพาณิชย์
xxx-xxx187-7
ไปยัง
น.ส. ปาริชาต ป.
ธนาคารเกียรตินาคินภัทร
xxx-x-x0202-x
จำนวน
1,000.00 บาท
ค่าธรรมเนียม
0.00 บาท
รหัสอ้างอิง: 20260830SCB998877665`;

/**
 * หน้า "รายการ ฝาก-ถอน" ของ kindee365 — หน้านี้บอกวันเวลาครบ และมีแต่บัญชีของเว็บ
 * บัญชีที่โอนออกจึงต้องเอามาจากสลิป (ธนาคารกรุงเทพใช้คำว่า "ไปที่" แทน "ไปยัง")
 */
const HISTORY_PAGE = `15:07
กินดี365
KINDEE365
ขอขอบคุณสำหรับความไว้วางใจ ติดต่อ@kind2024
รายการ ฝาก-ถอน
หน้าหลัก
ทั้งหมด
ฝาก
ถอน
ธนาคารไทยพาณิชย์
อนุมัติ
จำนวนเครดิต
เติมครดิต
2,300.08
+น.ส. ภัทธา พรรณสมัย+
26-Aug-2026 07:18
232-2-87048-4
หมายเหตุ:
Copyright © 2022-2023 All rights reserved.
kindee365.com`;

const BBL_SLIP = `Bangkok Bank
รายการสำเร็จ
26 ส.ค. 69, 07:18
จำนวนเงิน
2,300.08 THB
จาก
นาย กานต์พงศ์
703-0-xxx755
ธนาคารกรุงเทพ
ไปที่
นางสาว ภัทธา พรรณสมัย
232-2-xxx484
ธนาคารไทยพาณิชย์
ค่าธรรมเนียม 0.00 THB
หมายเลขอ้างอิง
626705
เลขที่อ้างอิง
2026082607180523005698808`;

/**
 * หน้า "สถานะฝากเงิน" ของ chokddd365 ที่กำลังโชว์รายการ "ถอนเครดิต"
 * หัวข้อหน้าเป็นคำว่าฝาก แต่ป้ายบนการ์ดคือถอน — ป้ายของรายการต้องชนะหัวข้อ
 * และยอดติดลบต้องอ่านออก (ตัวจับเลขกลางไม่รับขีดนำหน้า)
 */
const WITHDRAW_RECORD_PAGE = `14:34
เดต้อนรับทุกท่านเข้า CHOKDD หวยออนไลน์ที่มาแรงที่สุ
CHOK DDD 365
สถานะฝากเงิน
หน้าหลัก
ทั้งหมด
ฝาก
ถอน
SCB
ธนาคารไทยพาณิชย์
อนุมัติ
ถอน
เครดิต
-7,000.00
24-Aug-2026 08:56
ชื่อบัญชี:
เลขที่บัญชี:
สหภูมิ ฟองเมฆ
5502761877
หมายเหตุ:
THUNLUX - order.completed
cmt6psysh17r6hawbqqgs5uco REF: W-1279213471506
Copyright © 2023-2024 All rights reserved.
chokddd365.run`;

/**
 * หน้าสถานะฝากเงินของ ถูกเบอร์ — โดเมนเป็นภาษาไทย และชื่อบัญชีมีอักขระประดับคร่อม
 * แถมถูกตัดขึ้นบรรทัดใหม่กลางชื่อ ("//+++ชนินทร์ ศิริ" / "บุตร+++//")
 */
const THAI_DOMAIN_PAGE = `20:03
ถูกเบอร์
TUKBER
ผู้ใช้
ติดต่อเรา
เว็บซื้อหวยออ
หน้าหลัก
$ สถานะฝากเงิน
ทั้งหมด
ฝาก
ถอน
ธนาคารกรุงไทย
อนุมัติ
เติมครดิต
2,480.23
31-Aug-2026 20:03
ชื่อบัญชี:
เลขที่บัญชี:
//+++ชนินทร์ ศิริ
บุตร+++//
979-0-70991-9
หมายเหตุ:
-
SECURE WEBSITE GUARANTEE 100%
Copyright © 2021-2022 All Rights Reserved.
ถูกเบอร์.net`;

/**
 * หน้าสถานะของ ปันสุข24 ที่โชว์หลายรายการเรียงกัน
 * ต้องอ่านเฉพาะใบบนสุด ไม่งั้นยอดมาจากใบแรก เลขบัญชีมาจากใบที่สอง
 * แล้วชื่อธนาคารมาจากใบที่สาม กลายเป็นรายการที่ไม่มีอยู่จริง
 */
const RECORD_LIST_PAGE = `09:25
ปันสุข24.today
เว็บซื้อหว
ปันสุข24
PANSOOK24
สถานะฝากเงิน
หน้าหลัก
ทั้งหมด
ฝาก
ถอน
ธนาคารกรุงไทย
อนุมัติ
ถอน
เครดิต
-8,903.00
31-Aug-2026 09:21
ชื่อบัญชี:
เลขที่บัญชี:
มงคล ฮวบสูงเนิน
5100948094
หมายเหตุ:
-
ธนาคารกรุงเทพ
อนุมัติ
เติมเครดิต
2,300.00
28-Aug-2026 10:14
ชื่อบัญชี:
เลขที่บัญชี:
ชญานิน เสียงหาญ
9778871633
หมายเหตุ:
Slip verification approved - jobId: 70f39de5-4bda-491c-871e-93c30e9f81e0
ธนาคารเกียรตินาคินภัทร
อนุมัติ
เติมครดิต
2,400.00
27-Aug-2026 09:07
ชื่อบัญชี:
เลขที่บัญชี:`;

const SITES = [
  { id: "site-1", name: "LOTTOVIP" },
  { id: "site-2", name: "chokddd365", domain: null as string | null },
  { id: "site-3", name: "หวยดี", domain: "huaydee888.com" as string | null },
];

console.log("=== หน้าฝากเงิน (ข้อความจากภาพจริง) ===");
const deposit = extractWebPageFields(DEPOSIT_PAGE, { siteNames: SITES.map((s) => s.name) });
console.log(deposit);
console.log("จับคู่กับเว็บ:", resolveSite(SITES, { domain: deposit.domain, siteHint: deposit.siteHint })?.name);

console.log("\n=== หน้าถอนเงิน ===");
const withdraw = extractWebPageFields(WITHDRAW_PAGE, { siteNames: SITES.map((s) => s.name) });
console.log(withdraw);
console.log("จับคู่กับเว็บ:", resolveSite(SITES, { domain: withdraw.domain, siteHint: withdraw.siteHint })?.name);

console.log("\n=== หน้าฝากเงิน แบบ Vision สลับลำดับป้ายกับค่า ===");
console.log("ต้องได้ผลเท่าเดิม: โอนออกจาก ไทยพาณิชย์ 5502761877 → เข้า เกียรตินาคินภัทร 207950702");
const shuffled = extractWebPageFields(SHUFFLED_PAGE);
console.log({ from: shuffled.fromAccount, to: shuffled.toAccount, amount: shuffled.amount });

console.log("\n=== หน้ารายการ ฝาก-ถอน (kindee365) ===");
const history = extractWebPageFields(HISTORY_PAGE, { siteNames: SITES.map((s) => s.name) });
console.log(history);

console.log("\n=== หน้าสถานะ ที่โชว์รายการถอนเครดิต (chokddd365) ===");
console.log("ต้องได้: withdraw · 7000 · 24 ส.ค. 08:56 · บัญชีเรา SCB 5502761877 · ref W-1279213471506");
console.log(extractWebPageFields(WITHDRAW_RECORD_PAGE, { siteNames: SITES.map((s) => s.name) }));

console.log("\n=== หน้าเว็บที่โดเมนเป็นภาษาไทย (ถูกเบอร์.net) ===");
console.log("ต้องได้: deposit · 2480.23 · โดเมน ถูกเบอร์.net · บัญชี กรุงไทย 9790709919 ชนินทร์ ศิริบุตร");
console.log(extractWebPageFields(THAI_DOMAIN_PAGE));

console.log("\n=== หน้าสถานะที่มีหลายรายการ (ปันสุข24) — ต้องอ่านเฉพาะใบบนสุด ===");
console.log("ต้องได้: withdraw · 8903 · 31 ส.ค. 09:21 · บัญชีเรา กรุงไทย 5100948094 มงคล ฮวบสูงเนิน · ไม่มีบัญชีเว็บ");
console.log(extractWebPageFields(RECORD_LIST_PAGE));

console.log("\n=== แยกประเภทรูป ===");
for (const [name, text] of [
  ["หน้าฝากเงิน", DEPOSIT_PAGE],
  ["หน้าถอนเงิน", WITHDRAW_PAGE],
  ["หน้ารายการฝาก-ถอน", HISTORY_PAGE],
  ["หน้าสถานะ (ถอนเครดิต)", WITHDRAW_RECORD_PAGE],
  ["หน้าเว็บโดเมนไทย", THAI_DOMAIN_PAGE],
  ["หน้าสถานะหลายรายการ", RECORD_LIST_PAGE],
  ["สลิปธนาคาร", SLIP_TEXT],
  ["สลิปกรุงเทพ", BBL_SLIP],
] as const) {
  console.log(name, "→", classifyDocument({ text, qr: null }));
}

/** ประกอบ OcrResult เท่าที่การจับคู่ต้องใช้ ไม่ต้องเรียก Vision จริง */
function slipImage(id: string, order: number, text: string): ReadImage {
  const fields = extractSlipFields(text);
  const slip: OcrResult = {
    direction: fields.direction ?? "deposit",
    amount: fields.amount,
    occurredAt: fields.occurredAt?.toISOString() ?? null,
    occurredAtLocal: fields.occurredAt ? toDatetimeLocalValue(fields.occurredAt) : null,
    refNo: fields.refNo,
    bankName: fields.bankName,
    counterparty: fields.counterparty,
    counterpartyAccountNo: fields.counterpartyAccountNo,
    senderName: fields.senderName,
    senderAccountNo: fields.senderAccountNo,
    siteHint: null,
    confidence: 0.9,
    documentType: "bank_transfer_slip",
    warnings: [],
    sources: ["vision"],
    qr: null,
    raw: null,
  };
  return {
    id, fileName: `${id}.jpg`, kind: "slip", order,
    imagePath: `tmp/${id}.jpg`, imageHash: id.repeat(8),
    slip, web: null, duplicate: null, similar: null, warnings: [], error: null,
  };
}

function webImage(id: string, order: number, text: string): ReadImage {
  return {
    id, fileName: `${id}.jpg`, kind: "web", order,
    imagePath: `tmp/${id}.jpg`, imageHash: id.repeat(8),
    slip: null, web: extractWebPageFields(text), duplicate: null, similar: null, warnings: [], error: null,
  };
}

console.log("\n=== จับคู่ 2 คู่ที่อัปโหลดพร้อมกัน ===");
const images: ReadImage[] = [
  webImage("web1", 0, DEPOSIT_PAGE),
  slipImage("slip1", 1, SLIP_TEXT),
  webImage("web2", 2, WITHDRAW_PAGE),
  slipImage("slip2", 3, SLIP_TEXT.replace("1,000.00 บาท", "2,500.00 บาท").replace("14:36", "09:07")),
];

console.log("\n=== คู่จริง: หน้ารายการ kindee365 + สลิปกรุงเทพ ===");
for (const pair of pairImages([webImage("web3", 0, HISTORY_PAGE), slipImage("slip3", 1, BBL_SLIP)])) {
  const draft = mergePair(pair);
  console.log({
    direction: draft.direction,
    amount: draft.amount,
    occurredAtLocal: draft.occurredAtLocal,
    ourAccount: `${draft.bankName ?? "-"} ${draft.accountNo ?? "-"} ${draft.accountName ?? "-"}`,
    theirAccount: `${draft.counterpartyBank ?? "-"} ${draft.counterpartyAccountNo ?? "-"} ${draft.counterparty ?? "-"}`,
    site: draft.siteUrl,
    refNo: draft.refNo,
    warnings: draft.warnings,
  });
}

for (const pair of pairImages(images)) {
  const draft = mergePair(pair);
  console.log({
    web: pair.web?.id ?? null,
    slip: pair.slip?.id ?? null,
    direction: draft.direction,
    amount: draft.amount,
    occurredAtLocal: draft.occurredAtLocal,
    ourBank: draft.bankName,
    ourAccount: `${draft.accountNo ?? "-"} ${draft.accountName ?? "-"}`,
    theirAccount: `${draft.counterpartyBank ?? "-"} ${draft.counterpartyAccountNo ?? "-"} ${draft.counterparty ?? "-"}`,
    site: draft.siteUrl,
    refNo: draft.refNo,
    webRefNo: draft.webRefNo,
    warnings: draft.warnings,
  });
}
