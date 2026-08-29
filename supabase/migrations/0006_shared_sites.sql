-- ============================================================
--  เว็บทุกแถวเป็นของส่วนกลาง — ทุกคนเห็นและแก้รายชื่อเดียวกัน
--  เลิกแยก "เว็บกลาง (owner_id null)" ออกจาก "เว็บของฉัน"
-- ============================================================

-- index เดิมกันชื่อซ้ำเฉพาะภายในเจ้าของเดียวกัน — ต้องทิ้งก่อนรวมเป็นกองเดียว
drop index if exists public.sites_owner_name_key;

-- ชื่อที่ซ้ำกันข้ามเจ้าของ: เก็บแถวเก่าสุดไว้ตามเดิม ที่เหลือเติมเลขต่อท้าย
-- เติมเลขแทนการลบ เพราะรายการเงินที่ผูกอยู่กับแถวนั้นต้องไม่หาย
with ranked as (
  select
    id,
    row_number() over (
      partition by lower(btrim(name))
      order by (owner_id is null) desc, created_at, id
    ) as rn
  from public.sites
)
update public.sites s
   set name = s.name || ' (' || r.rn || ')'
  from ranked r
 where r.id = s.id
   and r.rn > 1;

update public.sites set owner_id = null where owner_id is not null;

create unique index if not exists sites_name_key
  on public.sites (lower(btrim(name)));

comment on column public.sites.owner_id is 'ไม่ใช้แล้ว — เว็บทุกแถวเป็นของส่วนกลาง ทุกคนเห็นและแก้ได้';
comment on table public.sites is 'รายชื่อเว็บที่ใช้ร่วมกันทั้งระบบ (ยอดเงินยังแยกตาม owner_id ของ transactions)';
