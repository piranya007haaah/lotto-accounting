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

console.log("\n=== แยกประเภทรูป ===");
for (const [name, text] of [
  ["หน้าฝากเงิน", DEPOSIT_PAGE],
  ["หน้าถอนเงิน", WITHDRAW_PAGE],
  ["สลิปธนาคาร", SLIP_TEXT],
] as const) {
  console.log(name, "→", classifyDocument({ text, qr: null }));
}

/** ประกอบ OcrResult เท่าที่การจับคู่ต้องใช้ ไม่ต้องเรียก Vision จริง */
function slipImage(id: string, order: number, text: string): ReadImage {
  const fields = extractSlipFields(text);
  const slip: OcrResult = {
    direction: "deposit",
    amount: fields.amount,
    occurredAt: fields.occurredAt?.toISOString() ?? null,
    occurredAtLocal: fields.occurredAt ? toDatetimeLocalValue(fields.occurredAt) : null,
    refNo: fields.refNo,
    bankName: fields.bankName,
    counterparty: fields.counterparty,
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
    slip, web: null, duplicate: null, warnings: [], error: null,
  };
}

function webImage(id: string, order: number, text: string): ReadImage {
  return {
    id, fileName: `${id}.jpg`, kind: "web", order,
    imagePath: `tmp/${id}.jpg`, imageHash: id.repeat(8),
    slip: null, web: extractWebPageFields(text), duplicate: null, warnings: [], error: null,
  };
}

console.log("\n=== จับคู่ 2 คู่ที่อัปโหลดพร้อมกัน ===");
const images: ReadImage[] = [
  webImage("web1", 0, DEPOSIT_PAGE),
  slipImage("slip1", 1, SLIP_TEXT),
  webImage("web2", 2, WITHDRAW_PAGE),
  slipImage("slip2", 3, SLIP_TEXT.replace("1,000.00 บาท", "2,500.00 บาท").replace("14:36", "09:07")),
];

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
