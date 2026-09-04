-- ============================================================
--  พอร์ตหวยจากแอป Streamlit (lottery-app) — เก็บผลที่คำนวณมาแล้ว
--
--  ทำไมเก็บเป็น jsonb ทั้งก้อน ไม่แตกเป็นคอลัมน์:
--  ตัวเลขพอร์ต (เส้นทุน · กำไรรายเดือน · Max DD · Loss streak) เกิดจาก engine
--  backtest ฝั่ง Python เท่านั้น — แอปนี้ไม่ได้คำนวณเอง แค่ "เอาไปวาด"
--  ⇒ แตกคอลัมน์ = ต้องตามแก้ schema ทุกครั้งที่ฝั่งโน้นเพิ่มตัวเลข
--  คอลัมน์ที่แยกออกมา (name/is_active/generated_at) มีไว้ query/เรียงเท่านั้น
--
--  หนึ่งแถว = หนึ่งพอร์ต — ส่งซ้ำ = ทับของเดิม (เก็บแค่ภาพล่าสุด ไม่เก็บประวัติ)
--  ผู้ส่ง = สคริปต์/แอปฝั่งโน้น ยืนยันตัวด้วย shared secret ไม่ใช่ LINE token
-- ============================================================

create table if not exists public.portfolio_snapshots (
  portfolio_id  integer     primary key,
  name          text        not null,
  is_active     boolean     not null default false,
  version       integer     not null default 1,
  -- เวลาที่ฝั่ง Python คำนวณ (ไม่ใช่เวลาที่มาถึง) — ใช้บอกผู้ใช้ว่าข้อมูลสดแค่ไหน
  generated_at  timestamptz not null default now(),
  received_at   timestamptz not null default now(),
  payload       jsonb       not null
);

comment on table public.portfolio_snapshots is
  'ผลพอร์ตที่คำนวณมาแล้วจาก lottery-app (Python) — แอปนี้อ่านอย่างเดียว ไม่คำนวณเอง';
comment on column public.portfolio_snapshots.portfolio_id is
  'id ของพอร์ตในฐานข้อมูลฝั่ง lottery-app (SQLite) — ส่งซ้ำด้วย id เดิม = ทับของเดิม';
comment on column public.portfolio_snapshots.is_active is
  'พอร์ตที่ติ๊ก "ใช้จริง" ฝั่งโน้น — หน้าเว็บเลือกตัวนี้ขึ้นก่อน';
comment on column public.portfolio_snapshots.version is
  'เวอร์ชันรูปแบบของ payload (SNAPSHOT_VERSION ฝั่ง Python) — ขึ้นเมื่อความหมายของคีย์เปลี่ยน';
comment on column public.portfolio_snapshots.generated_at is
  'เวลาที่ฝั่ง Python สร้าง snapshot — คนละตัวกับ received_at ที่เป็นเวลาที่บันทึกลงตารางนี้';
comment on column public.portfolio_snapshots.payload is
  'ก้อน JSON เต็ม: kpi · equity · monthly · legs (ดู src/lib/types.ts → PortfolioSnapshot)';

create index if not exists portfolio_snapshots_active_idx
  on public.portfolio_snapshots (is_active desc, generated_at desc);

-- RLS: เปิดไว้และไม่สร้าง policy ใด ๆ (เหมือนตารางอื่นในโปรเจกต์นี้)
-- ⇒ anon key แตะข้อมูลไม่ได้เลย · เข้าถึงผ่าน service_role ฝั่ง server เท่านั้น
-- ซึ่งตรวจสิทธิ์ "ผู้ดูแล" ก่อนทุกครั้ง (ตัวเลขพอร์ตเป็นเงินของเจ้าของคนเดียว)
alter table public.portfolio_snapshots enable row level security;
