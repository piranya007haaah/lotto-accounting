-- ============================================================
--  รายชื่อเว็บตั้งต้น (owner_id = null → ทุกคนเห็นใน dropdown)
--  แก้ชื่อ / ปิดการใช้งาน / เพิ่มเว็บของตัวเองได้ในหน้า "จัดการเว็บ"
-- ============================================================

insert into public.sites (owner_id, name, sort_order, color)
values
  (null, 'LOTTOVIP',    10, '#2563eb'),
  (null, 'RUAY',        20, '#dc2626'),
  (null, 'JETSADABET',  30, '#059669'),
  (null, 'LOTTOSOD',    40, '#d97706'),
  (null, 'HUAYDEE',     50, '#7c3aed')
on conflict do nothing;
