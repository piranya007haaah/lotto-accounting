-- ============================================================
--  lotto-accounting — โครงสร้างฐานข้อมูลหลัก
--  รันด้วย: supabase db push  หรือ copy ไปวางใน SQL Editor ของ Supabase
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ฟังก์ชันช่วย: อัปเดต updated_at อัตโนมัติ
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ------------------------------------------------------------
-- ผู้ใช้ — หนึ่งแถวต่อหนึ่ง LINE account (ข้อมูลของแต่ละคนแยกขาดจากกัน)
-- ------------------------------------------------------------
create table if not exists public.app_users (
  id            uuid primary key default gen_random_uuid(),
  line_user_id  text not null unique,
  display_name  text,
  picture_url   text,
  is_active     boolean not null default true,
  last_seen_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.app_users is 'ผู้ใช้ที่ล็อกอินผ่าน LINE Login — line_user_id คือ sub จาก ID token';

drop trigger if exists app_users_set_updated_at on public.app_users;
create trigger app_users_set_updated_at
  before update on public.app_users
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- เว็บหวย — owner_id = null คือเว็บกลางที่ทุกคนเห็น
-- ------------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid references public.app_users(id) on delete cascade,
  name        text not null check (length(btrim(name)) > 0),
  note        text,
  color       text,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on column public.sites.owner_id is 'null = เว็บกลาง (seed) / มีค่า = เว็บที่ผู้ใช้คนนั้นเพิ่มเอง';

-- กันชื่อซ้ำภายในเจ้าของเดียวกัน (รวมกรณี owner_id เป็น null)
create unique index if not exists sites_owner_name_key
  on public.sites (coalesce(owner_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(btrim(name)));

drop trigger if exists sites_set_updated_at on public.sites;
create trigger sites_set_updated_at
  before update on public.sites
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- รายการเงินเข้า/ออก
--   direction = 'deposit'  → ฝากเงินเข้าเว็บ (สลิปโอน)
--   direction = 'withdraw' → ถอนเงินออกจากเว็บ (แคปหน้าถอนสำเร็จ)
-- ------------------------------------------------------------
create table if not exists public.transactions (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.app_users(id) on delete cascade,
  site_id         uuid not null references public.sites(id) on delete restrict,
  direction       text not null check (direction in ('deposit', 'withdraw')),
  amount          numeric(14, 2) not null check (amount > 0),
  occurred_at     timestamptz not null,
  -- วันที่ตามเวลาไทย ใช้ตัดยอดรายวัน/รายเดือน
  occurred_date   date generated always as ((occurred_at at time zone 'Asia/Bangkok')::date) stored,
  ref_no          text,
  bank_name       text,
  counterparty    text,
  note            text,
  image_path      text,
  image_hash      text,
  ocr_status      text not null default 'manual'
                  check (ocr_status in ('manual', 'ocr', 'ocr_edited', 'failed')),
  ocr_confidence  numeric(4, 3),
  ocr_raw         jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.transactions.image_hash is 'sha256 ของไฟล์รูป — ใช้กันบันทึกสลิปใบเดิมซ้ำ';
comment on column public.transactions.ocr_status is 'manual = กรอกเอง, ocr = ใช้ค่าที่อ่านได้ทั้งหมด, ocr_edited = อ่านแล้วแก้, failed = อ่านไม่ออกเลย';

create unique index if not exists transactions_owner_image_hash_key
  on public.transactions (owner_id, image_hash)
  where image_hash is not null;

create index if not exists transactions_owner_date_idx
  on public.transactions (owner_id, occurred_date desc, occurred_at desc);

create index if not exists transactions_owner_occurred_at_idx
  on public.transactions (owner_id, occurred_at desc);

create index if not exists transactions_owner_site_date_idx
  on public.transactions (owner_id, site_id, occurred_date desc);

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- View สรุปยอด (ไว้ดูใน Supabase Studio — ตัวเว็บคำนวณเองจาก transactions)
-- ------------------------------------------------------------
create or replace view public.v_daily_totals
with (security_invoker = on) as
select
  t.owner_id,
  t.site_id,
  t.occurred_date,
  coalesce(sum(t.amount) filter (where t.direction = 'deposit'), 0)  as deposit_total,
  coalesce(sum(t.amount) filter (where t.direction = 'withdraw'), 0) as withdraw_total,
  coalesce(sum(t.amount) filter (where t.direction = 'withdraw'), 0)
    - coalesce(sum(t.amount) filter (where t.direction = 'deposit'), 0) as net_total,
  count(*) as tx_count
from public.transactions t
group by t.owner_id, t.site_id, t.occurred_date;

create or replace view public.v_monthly_totals
with (security_invoker = on) as
select
  t.owner_id,
  t.site_id,
  to_char(t.occurred_date, 'YYYY-MM') as month,
  coalesce(sum(t.amount) filter (where t.direction = 'deposit'), 0)  as deposit_total,
  coalesce(sum(t.amount) filter (where t.direction = 'withdraw'), 0) as withdraw_total,
  coalesce(sum(t.amount) filter (where t.direction = 'withdraw'), 0)
    - coalesce(sum(t.amount) filter (where t.direction = 'deposit'), 0) as net_total,
  count(*) as tx_count
from public.transactions t
group by t.owner_id, t.site_id, to_char(t.occurred_date, 'YYYY-MM');

-- ------------------------------------------------------------
-- RLS: เปิดไว้และไม่สร้าง policy ใด ๆ
--   → anon / authenticated key เข้าไม่ถึงข้อมูลเลย
--   → เว็บเข้าถึงผ่าน service_role key ฝั่ง server เท่านั้น
--     และกรองด้วย owner_id ของผู้ใช้ที่ผ่านการตรวจ LINE ID token แล้ว
-- ------------------------------------------------------------
alter table public.app_users    enable row level security;
alter table public.sites        enable row level security;
alter table public.transactions enable row level security;

-- ------------------------------------------------------------
-- Storage bucket สำหรับรูปสลิป (private)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('slips', 'slips', false)
on conflict (id) do nothing;
