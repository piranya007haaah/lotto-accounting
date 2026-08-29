/**
 * ตรวจตัวอ่านข้อความสลิป (ส่วนที่ทำงานต่อจาก Google Vision) โดยไม่ต้องเรียก API จริง
 *
 *   npx tsx scripts/parser-check.ts
 *
 * ใช้ตอนแก้กติกาการอ่าน เพื่อดูว่ายอดเงิน/วันที่ยังอ่านถูกอยู่ไหม
 */
import { parseSlipText } from "../src/lib/ocr-google";

const CASES: Array<{ name: string; text: string; sites?: string[] }> = [
  {
    name: "SCB โอนเงินสำเร็จ",
    text: `SCB
โอนเงินสำเร็จ
25 ส.ค. 2569 - 14:30 น.
จาก
นาย ปริญญา ย.
ธนาคารไทยพาณิชย์
xxx-xxx123-4
ไปยัง
นาย สมชาย ก.
ธนาคารกสิกรไทย
xxx-x-x5678-x
จำนวน
1,500.00 บาท
ค่าธรรมเนียม
0.00 บาท
รหัสอ้างอิง: 20260825SCB123456789`,
  },
  {
    name: "K PLUS วันที่/เวลาคนละบรรทัด",
    text: `K PLUS
รายการสำเร็จ
25 ส.ค. 69
14:30 น.
จาก ปริญญา ย.
ธ.กสิกรไทย
ไปยัง สมชาย ก.
ธ.ไทยพาณิชย์
จำนวน:
2,000.00 บาท
เลขที่รายการ: 015202608251234567`,
  },
  {
    name: "หน้าเว็บถอนเงิน (มียอดคงเหลือหลอก)",
    text: `ถอนเงินสำเร็จ
LOTTOVIP
เครดิตคงเหลือ 1,250.50
จำนวนเงิน 5,000 บาท
เวลา 25/08/2569 09:15`,
    sites: ["ลอตโต้วีไอพี", "LOTTOVIP", "หวยดี"],
  },
  {
    name: "ยอดไม่มีคอมมา + เลขไทย",
    text: `ถอนเงิน
ยอดถอน ๕๐๐ บาท
๒๕/๐๘/๒๕๖๙ ๐๙:๐๕
Ref No. AB12345678`,
  },
  {
    name: "พร้อมเพย์ ไม่มีชื่อธนาคาร",
    text: `โอนเงินสำเร็จ
พร้อมเพย์
จำนวนเงิน
850.50
บาท
26 ส.ค. 2569 08:05 น.`,
  },
  {
    // ข้อความจริงที่ Google Vision อ่านได้จากสลิป K+ ชำระเงินร้านค้า
    name: "K+ ชำระเงินร้านค้า (ข้อความจริงจาก Vision)",
    text: `ชำระเงินสำเร็จ
26 ส.ค. 69 17:02 น.
นาย ปริญญา ส
ธ.กสิกรไทย
XXX-X-X2772-x
eee
eeeen
ข้าวต้น
ผัง
ข้าวต้มย้ง
บจก. ข้าวต้มย้ง
202608262671543
เลขที่รายการ:
016238170247CQR02925
K+
จำนวน:
350.00 บาท
ค่าธรรมเนียม:
0.00 บาท
สแกนตรวจสอบสลิป`,
  },
  {
    // สลิป SCB จ่ายบิล — Vision กองป้ายฝั่งซ้ายไว้ด้วยกัน แล้วค่อยตามด้วยค่า
    // และโยนยอดเงินไปไว้บรรทัดสุดท้ายห่างจากป้าย "จำนวนเงิน"
    name: "SCB จ่ายบิล — Vision สลับลำดับป้ายกับค่า (ข้อความจริงจาก Vision)",
    text: `จาก
ไปยัง
จำนวนเงิน
SCB
จ่ายเงินสำเร็จ
29 ส.ค. 2569 - 13:54
รหัสอ้างอิง: 202608291xrFELgRCjD9g32Py
7 นาย ปริญญา ส.
XXX-XXX350-8
E MINIMAL THARUA
Biller ID : 010753600031501
รหัสร้านค้า : KB000002292127
รหัสธุรกรรม : KPS004KB000002292127
ผู้รับเงินสามารถสแกนคิวอาร์โค้ดนี้เพื่อ
ตรวจสอบสถานะการจ่ายเงิน
55.00`,
  },
  {
    name: "อ่านไม่ออก",
    text: `เมนู
โปรโมชั่น
ติดต่อเรา`,
  },
];

for (const testCase of CASES) {
  const result = parseSlipText(testCase.text, testCase.sites ?? []);
  console.log(`\n=== ${testCase.name} ===`);
  console.log({
    type: result.document_type,
    direction: result.direction,
    amount: result.amount,
    datetime: result.datetime_iso,
    date_text: result.date_text,
    time_text: result.time_text,
    ref: result.ref_no,
    bank: result.bank_name,
    to: result.counterparty,
    site: result.site_hint,
    confidence: result.confidence,
  });
}
