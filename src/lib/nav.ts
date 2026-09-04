/**
 * โครงเมนูของทั้งแอป — **แหล่งเดียว** ทั้งแถบล่างและปุ่มสลับโหมดอ่านจากที่นี่
 *
 * แอปนี้ทำ 2 เรื่องที่ไม่เกี่ยวกัน: **ลงบัญชี**เงินเข้า-ออกเว็บ กับ **หวย**
 * (พอร์ต/สูตร/สถิติ ที่กำลังทยอยย้ายมาจากแอป Streamlit) — ถ้าเอามากองในแถบล่าง
 * แถบเดียวจะแน่นจนกดพลาด และจะแน่นขึ้นเรื่อย ๆ ทุกครั้งที่ย้ายหน้ามาเพิ่ม
 * ⇒ แยกเป็น "โหมด" แถบล่างเปลี่ยนทั้งชุดตามโหมดที่เปิดอยู่ (สลับที่หัวจอ)
 *
 * เพิ่มหน้าใหม่ = เพิ่มบรรทัดใน items ของโหมดนั้น ไม่ต้องแตะที่อื่น
 * ⚠️ อย่าใส่หน้าที่ยังไม่มีจริง — กดแล้วเจอ 404 แย่กว่าไม่มีปุ่ม
 */

export interface NavItem {
  href: string;
  label: string;
  /** เส้น path ของไอคอน วาดบน viewBox 24×24 แบบเส้นขอบอย่างเดียว */
  icon: string;
}

export interface NavMode {
  key: "money" | "lottery";
  label: string;
  emoji: string;
  /**
   * true = ต้องมีสิทธิ์ "ดูหน้าหวย" ถึงจะเห็น (พอร์ตเป็นเงินของเจ้าของคนเดียว)
   * ผู้ดูแลเปิดให้ทีละคนที่หน้า /admin · ผู้ดูแลเองเห็นเสมอ
   */
  lotteryOnly?: boolean;
  items: NavItem[];
}

export const MODES: NavMode[] = [
  {
    key: "money",
    label: "บัญชี",
    emoji: "💰",
    items: [
      { href: "/", label: "บันทึก", icon: "M12 5v14M5 12h14" },
      { href: "/summary", label: "สรุปยอด", icon: "M4 20h16M7 16v-5M12 16V7M17 16v-9" },
      { href: "/history", label: "รายการ", icon: "M4 6h16M4 12h16M4 18h10" },
      {
        href: "/sites",
        label: "เว็บ",
        icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3c-2.4 2.8-2.4 15.2 0 18M12 3c2.4 2.8 2.4 15.2 0 18",
      },
    ],
  },
  {
    key: "lottery",
    label: "หวย",
    emoji: "🎲",
    lotteryOnly: true,
    items: [
      { href: "/draws", label: "กรอกผล", icon: "M12 20h9M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4" },
      { href: "/portfolio", label: "พอร์ต", icon: "M3 17l5-5 4 3 5-7M3 21h18M3 3v18" },
      { href: "/formulas", label: "สูตร", icon: "M4 5h16M9 5v6l-5 8h16l-5-8V5" },
      // ต่อไป: สถิติ · สามตัว — ย้ายมาจาก Streamlit ทีละหน้า
    ],
  },
];

/** หน้าที่ไม่อยู่ในแถบล่าง (เข้าจากปุ่มมุมขวาบนแทน) — ไม่ได้ใช้บ่อยพอจะกินที่ */
export const ADMIN_PAGE: NavItem = {
  href: "/admin",
  label: "สมาชิก",
  icon: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
};

/** โหมดที่ path นี้อยู่ — ไม่ตรงกับโหมดไหนเลย (เช่น /admin) ถือเป็น "บัญชี" */
export function modeOf(pathname: string): NavMode {
  const found = MODES.find((mode) =>
    mode.items.some((item) => item.href === pathname || (item.href !== "/" && pathname.startsWith(`${item.href}/`))),
  );
  return found ?? MODES[0];
}

/** โหมดที่คนนี้เห็น — โหมดหวยต้องมีสิทธิ์ `canViewLottery` (ผู้ดูแลได้มาเองอยู่แล้ว) */
export function modesFor(access: { canViewLottery: boolean }): NavMode[] {
  return MODES.filter((mode) => !mode.lotteryOnly || access.canViewLottery);
}
