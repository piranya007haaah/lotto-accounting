-- ============================================================
--  lotto-accounting — สิทธิ์ "เห็นข้อมูลของทุกคน"
--  แยกจากสิทธิ์ "เข้าใช้งานได้" (is_active) คนละเรื่องกัน
--  ค่าเริ่มต้น false = เห็นเฉพาะบัญชีของตัวเอง (แยกขาดจากคนอื่น)
--  รันด้วย: supabase db push  หรือ copy ไปวางใน SQL Editor ของ Supabase
-- ============================================================

alter table public.app_users
  add column if not exists can_view_all boolean not null default false;

comment on column public.app_users.can_view_all is
  'true = ดูรายการและสรุปยอดของทุกคนได้ (อ่านอย่างเดียว) / false = เห็นเฉพาะของตัวเอง';
