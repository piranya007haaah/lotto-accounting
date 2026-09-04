-- ============================================================
--  lotto-accounting — สิทธิ์ "เห็นหน้าหวย" (โหมด 🎲 หวย ทั้งโหมด)
--  แยกจาก can_view_all (ซึ่งเป็นเรื่องบัญชีเงินเข้า-ออกของสมาชิก) คนละเรื่องกัน
--  ค่าเริ่มต้น false = ไม่เห็นแม้แต่ปุ่มสลับโหมด (พอร์ตเป็นเงินของเจ้าของคนเดียว)
--  ผู้ดูแลเห็นเสมอโดยไม่ต้องติ๊ก — โค้ดฝั่ง auth บังคับให้
--  รันด้วย: supabase db push  หรือ copy ไปวางใน SQL Editor ของ Supabase
-- ============================================================

alter table public.app_users
  add column if not exists can_view_lottery boolean not null default false;

comment on column public.app_users.can_view_lottery is
  'true = เห็นโหมดหวย (พอร์ต + สูตร) / false = เห็นแต่โหมดบัญชี';
