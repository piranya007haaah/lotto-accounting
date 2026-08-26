-- ============================================================
--  lotto-accounting — ระบบอนุมัติสมาชิก
--  ผู้ใช้ที่เข้ามาใหม่ต้องรอผู้ดูแลกดอนุมัติก่อนถึงใช้งานได้
--  รันด้วย: supabase db push  หรือ copy ไปวางใน SQL Editor ของ Supabase
-- ============================================================

-- ตั้งแต่นี้ไป คนที่ล็อกอินเข้ามาใหม่จะยังใช้งานไม่ได้จนกว่าผู้ดูแลจะอนุมัติ
-- (คนที่มีอยู่แล้วไม่ถูกแตะ ยังใช้งานได้ตามเดิม)
alter table public.app_users alter column is_active set default false;

-- เก็บเวลาที่ได้รับอนุมัติ ไว้แสดงในหน้าผู้ดูแล
alter table public.app_users add column if not exists approved_at timestamptz;

-- คนที่ใช้งานได้อยู่แล้ว ณ ตอนรัน migration นี้ ถือว่าผ่านการอนุมัติแล้ว
update public.app_users
   set approved_at = coalesce(approved_at, now())
 where is_active;

-- หน้าผู้ดูแลเรียง "รออนุมัติ" ขึ้นก่อน แล้วค่อยเรียงตามเวลาที่เข้ามา
create index if not exists app_users_pending_idx
  on public.app_users (is_active, created_at desc);
