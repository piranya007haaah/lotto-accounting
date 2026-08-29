-- เพิ่มช่อง emoji ประจำเว็บ — แสดงนำหน้าชื่อเว็บในทุกหน้า (null = ใช้จุดสีแบบเดิม)
alter table public.sites add column if not exists emoji text;

comment on column public.sites.emoji is 'อิโมจิประจำเว็บ เช่น 🎰 — null = แสดงจุดสีแทน';
