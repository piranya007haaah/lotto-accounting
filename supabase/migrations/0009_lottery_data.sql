-- ============================================================
--  ผลหวยย้อนหลัง — ย้ายมาจาก SQLite ของแอป Streamlit (lottery-app)
--
--  หนึ่งแถว = หนึ่ง (หวย, ตำแหน่ง, ปี) · `sequence` เก็บผลทั้งปีเป็นสตริงเดียว
--  2 ตัวอักษร = 1 วัน **เรียงตามวันปฏิทินจาก 1 ม.ค.** ไม่ใช่ "งวดที่"
--    "45"  = ผลของวันนั้น
--    "xx"  = วันหยุด (หวยไม่ออก)
--    "--"  = ยังไม่ถึง/ยังไม่ได้กรอก
--  ⚠️⚠️ ห้ามตัดสตริงให้สั้นลงเพื่อกรองเดือน — วันที่จะเลื่อนทั้งเส้นแบบเงียบ ๆ
--       ต้อง "ปิดวันอื่นเป็น --" แทน (กติกาเดียวกับ db.mask_months ฝั่ง Python)
--
--  ทำไมเก็บเป็นสตริงไม่ใช่แถวละงวด: ทั้ง engine อ่านทีละปีเป็นก้อนเดียวเสมอ
--  (สูตรนับความถี่ทั้ง train · backtest ไล่ทีละวัน) แตกเป็น 400,000 แถวแล้วต้อง
--  ประกอบกลับทุกครั้ง ช้ากว่าและเปิดช่องให้ลำดับเพี้ยน
--
--  ข้อมูลมาทางเดียว: Streamlit (SQLite) → POST /api/lottery/datasets → ตารางนี้
--  แอปนี้ **อ่านอย่างเดียว** ยังไม่แก้ผลหวย จนกว่าจะย้ายหน้ากรอกผลมาด้วย
-- ============================================================

create table if not exists public.lottery_datasets (
  lottery        text        not null,
  position       text        not null,
  year           text        not null,
  flag           text        not null default '🎰',
  sequence       text        not null default '',
  -- entry ที่ไม่ได้เรียงตามวันที่ → แปลง index เป็นวันที่ไม่ได้ (เจาะจงเดือนไม่ได้)
  is_date_sorted boolean     not null default false,
  updated_at     timestamptz not null default now(),
  primary key (lottery, position, year)
);

comment on table public.lottery_datasets is
  'ผลหวย 2 ตัวย้อนหลัง — sync มาจาก SQLite ของ lottery-app (แอปนี้อ่านอย่างเดียว)';
comment on column public.lottery_datasets.sequence is
  '2 ตัวอักษร = 1 วันปฏิทินจาก 1 ม.ค. · xx = วันหยุด · -- = ยังไม่มีผล (ห้ามตัดให้สั้น)';
comment on column public.lottery_datasets.is_date_sorted is
  'false = ลำดับใน sequence ไม่ตรงวันปฏิทิน → เจาะจงเดือน/แปลงเป็นวันที่ไม่ได้';

-- หน้าเลือกสูตรโหลด "ทุกหวยของปีที่เลือก" ทีเดียว → index ตามปีคุ้มสุด
create index if not exists lottery_datasets_year_idx
  on public.lottery_datasets (year);

-- ------------------------------------------------------------
-- เรตจ่ายประจำหวย — ค่าเริ่มต้นของช่อง "เรตจ่าย" ในหน้าเลือกสูตร
-- ------------------------------------------------------------
create table if not exists public.lottery_payouts (
  lottery text primary key,
  payout  integer not null default 100
);

comment on table public.lottery_payouts is
  'เรตจ่ายที่ตั้งไว้ต่อหวย — ไม่มีแถว = ใช้ค่าเริ่มต้น 100 (เกมยุติธรรมพอดีสำหรับ 2 ตัว)';

-- RLS: เปิดไว้และไม่สร้าง policy ใด ๆ (เหมือนตารางอื่นในโปรเจกต์นี้)
-- ⇒ anon key แตะไม่ได้ · เข้าถึงผ่าน service_role ฝั่ง server เท่านั้น
alter table public.lottery_datasets enable row level security;
alter table public.lottery_payouts  enable row level security;
