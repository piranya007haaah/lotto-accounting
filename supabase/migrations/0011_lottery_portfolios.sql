-- ============================================================
--  พอร์ตหวย "ตัวจริง" — ย้ายมาจากตาราง portfolios (SQLite) ของ lottery-app
--
--  ต่างจาก portfolio_snapshots (migration 0008) คนละเรื่องกัน:
--    portfolio_snapshots = **ผลที่คำนวณแล้ว** จาก Python (แอปนี้อ่านอย่างเดียว)
--    lottery_portfolios  = **ตัวตั้งค่าพอร์ต** ที่แก้ได้จากแอปนี้ แล้วคำนวณสดฝั่ง TS
--
--  ⚠️⚠️ ตั้งใจให้ **ตารางนี้เป็นเจ้าของข้อมูล** หลังนำเข้าครั้งแรก:
--  สคริปต์ฝั่ง Python นำเข้าได้ครั้งเดียว (`--replace` ถึงจะทับ) ไม่งั้น sync รอบหน้า
--  จะลบสิ่งที่เพิ่งแก้ในเว็บทิ้งโดยไม่มีใครรู้
-- ============================================================

create table if not exists public.lottery_portfolios (
  -- id เดียวกับฝั่ง SQLite ตอนนำเข้า (พอร์ตที่สร้างใหม่ในเว็บใช้ id ที่ต่อจากของเดิม)
  id         integer     primary key,
  name       text        not null,
  source     text,
  capital    bigint      not null default 0,
  -- ทั้งก้อน: legs[] · is_active · schedule (รูปแบบเดียวกับ config_json ฝั่งโน้นเป๊ะ)
  -- เก็บเป็น jsonb เพราะ engine อ่านทั้งก้อนเสมอ และคีย์ของขาเพิ่มได้เรื่อย ๆ
  config     jsonb       not null default '{}'::jsonb,
  is_active  boolean     not null default false,
  updated_at timestamptz not null default now()
);

comment on table public.lottery_portfolios is
  'ตั้งค่าพอร์ตหวย (legs/ทุน/เงินแทง) — แก้ได้จากหน้า /portfolio ของแอปนี้';
comment on column public.lottery_portfolios.config is
  'รูปแบบเดียวกับ config_json ฝั่ง lottery-app: {legs:[...], is_active, schedule}';
comment on column public.lottery_portfolios.is_active is
  'พอร์ต "ใช้จริง" — ตัวที่รายงาน LINE และหน้าเว็บเลือกขึ้นก่อน';

create index if not exists lottery_portfolios_active_idx
  on public.lottery_portfolios (is_active desc, updated_at desc);

alter table public.lottery_portfolios enable row level security;

-- ------------------------------------------------------------
--  ผลหวย 3 ตัว อยู่ตารางเดียวกับ 2 ตัว — คนละ position ("สามบน") จึงไม่ชนกัน
--  แต่ต้องบอก engine ให้ชัดว่า 1 งวด = กี่ตัวอักษร ไม่ใช่เดาจากชื่อตำแหน่ง
-- ------------------------------------------------------------
alter table public.lottery_datasets
  add column if not exists digits smallint not null default 2;

comment on column public.lottery_datasets.digits is
  'จำนวนตัวอักษรต่อ 1 วันใน sequence — 2 = สองบน/สองล่าง · 3 = สามบน';
