/**
 * รหัสธนาคาร 3 หลักตามมาตรฐานของ ITMX ที่ฝังมาใน QR ตรวจสอบสลิป
 * ใช้แปลงรหัสที่ถอดได้จาก QR ให้เป็นชื่อธนาคารภาษาไทย
 */
const THAI_BANKS: Record<string, string> = {
  "001": "ธนาคารแห่งประเทศไทย",
  "002": "ธนาคารกรุงเทพ",
  "004": "ธนาคารกสิกรไทย",
  "006": "ธนาคารกรุงไทย",
  "011": "ธนาคารทหารไทยธนชาต",
  "014": "ธนาคารไทยพาณิชย์",
  "017": "ธนาคารซิตี้แบงก์",
  "018": "ธนาคารซูมิโตโม มิตซุย",
  "020": "ธนาคารสแตนดาร์ดชาร์เตอร์ด",
  "022": "ธนาคารซีไอเอ็มบี ไทย",
  "024": "ธนาคารยูโอบี",
  "025": "ธนาคารกรุงศรีอยุธยา",
  "030": "ธนาคารออมสิน",
  "031": "ธนาคารเอชเอสบีซี",
  "033": "ธนาคารอาคารสงเคราะห์",
  "034": "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร",
  "035": "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย",
  "039": "ธนาคารมิซูโฮ",
  "045": "ธนาคารบีเอ็นพี พาริบาส์",
  "052": "ธนาคารแห่งประเทศจีน",
  "066": "ธนาคารอิสลามแห่งประเทศไทย",
  "067": "ธนาคารทิสโก้",
  "069": "ธนาคารเกียรตินาคินภัทร",
  "070": "ธนาคารไอซีบีซี (ไทย)",
  "071": "ธนาคารไทยเครดิต",
  "073": "ธนาคารแลนด์ แอนด์ เฮ้าส์",
  "098": "ธนาคารพัฒนาวิสาหกิจขนาดกลางและขนาดย่อม",
};

/** คืนชื่อธนาคารจากรหัส 3 หลัก — ไม่รู้จักก็คืน null ไม่ต้องเดา */
export function thaiBankName(code: string | null | undefined): string | null {
  if (!code) return null;
  return THAI_BANKS[code] ?? null;
}

/** สีประจำแบรนด์กับตัวย่อของธนาคาร ใช้ทำป้ายสีในหน้าสรุปยอด */
export interface BankMark {
  short: string;
  color: string;
}

/**
 * จับคู่จากชื่อที่ "เห็นบนสลิป" ไม่ใช่รหัส เพราะรายการเงินออกจากเว็บไม่มี QR ให้ถอด
 * ชื่อจึงมาจากตัวอ่านตัวหนังสือหรือผู้ใช้พิมพ์เอง — รับทั้งชื่อไทยและตัวย่ออังกฤษ
 *
 * เรียงจากชื่อที่เจาะจงกว่าไปหาชื่อสั้น เพราะเทียบแบบ substring
 * ("bangkokbank" มีคำว่า "kbank" อยู่ข้างใน)
 */
const BANK_MARKS: Array<{ aliases: string[]; mark: BankMark }> = [
  { aliases: ["กรุงเทพ", "bangkokbank", "bualuang", "bbl"], mark: { short: "BBL", color: "#1e4598" } },
  { aliases: ["กสิกรไทย", "kasikorn", "kbank", "kplus"], mark: { short: "KBANK", color: "#138f2d" } },
  { aliases: ["ไทยพาณิชย์", "siamcommercial", "scb"], mark: { short: "SCB", color: "#4e2e7f" } },
  { aliases: ["กรุงไทย", "krungthai", "ktb"], mark: { short: "KTB", color: "#1ba5e1" } },
  { aliases: ["กรุงศรี", "krungsri", "ayudhya", "bay"], mark: { short: "BAY", color: "#fec43b" } },
  { aliases: ["ทหารไทยธนชาต", "thanachart", "ttb", "tmb"], mark: { short: "TTB", color: "#1279be" } },
  { aliases: ["ออมสิน", "gsb"], mark: { short: "GSB", color: "#eb198d" } },
  { aliases: ["อาคารสงเคราะห์", "ghbank", "ghb"], mark: { short: "GHB", color: "#f57d23" } },
  { aliases: ["เพื่อการเกษตร", "ธกส", "baac"], mark: { short: "BAAC", color: "#4b9b1d" } },
  { aliases: ["ซีไอเอ็มบี", "cimb"], mark: { short: "CIMB", color: "#7e2f36" } },
  { aliases: ["ยูโอบี", "uob"], mark: { short: "UOB", color: "#0b3979" } },
  { aliases: ["แลนด์แอนด์เฮ้าส์", "lhbank", "lhb"], mark: { short: "LHB", color: "#6d6e71" } },
  { aliases: ["เกียรตินาคิน", "kkp"], mark: { short: "KKP", color: "#199cc5" } },
  { aliases: ["ทิสโก้", "tisco"], mark: { short: "TISCO", color: "#12549f" } },
  { aliases: ["ไทยเครดิต", "thaicredit"], mark: { short: "TCR", color: "#6d6e71" } },
  { aliases: ["อิสลาม", "ibank"], mark: { short: "IBANK", color: "#184615" } },
  { aliases: ["ซิตี้แบงก์", "citi"], mark: { short: "CITI", color: "#1b64b0" } },
  { aliases: ["สแตนดาร์ดชาร์เตอร์ด", "standardchartered", "scbt"], mark: { short: "SCBT", color: "#0473ea" } },
  { aliases: ["เอชเอสบีซี", "hsbc"], mark: { short: "HSBC", color: "#db0011" } },
  { aliases: ["ทรูมันนี่", "truemoney", "truewallet"], mark: { short: "TMN", color: "#ee3124" } },
];

/** ป้ายสีของธนาคาร — ไม่รู้จักก็คืน null ให้ฝั่งหน้าเว็บตัดสินใจเองว่าจะแสดงอะไรแทน */
export function bankMark(name: string | null | undefined): BankMark | null {
  const key = (name ?? "").replace(/[\s.\-_]/g, "").toLowerCase();
  if (!key) return null;
  for (const entry of BANK_MARKS) {
    if (entry.aliases.some((alias) => key.includes(alias))) return entry.mark;
  }
  return null;
}
