-- ============================================================
--  อัปโหลด "หน้าเว็บ + สลิป" เป็นคู่
--
--  หนึ่งรายการเก็บได้สองรูป
--    image_path      สลิปโอนเงินของธนาคาร (มี QR ให้ถอดเลขที่รายการ)
--    web_image_path  ภาพหน้าฝาก/ถอนของเว็บ (บอกว่าเว็บไหน และบัญชีไหนโอนออก/รับเงิน)
--
--  ธนาคาร/บัญชีเก็บสองฝั่ง
--    bank_name + account_no + account_name                       = บัญชีของเรา
--    counterparty_bank + counterparty_account_no + counterparty  = บัญชีของเว็บ
-- ============================================================

alter table public.transactions
  add column if not exists web_image_path          text,
  add column if not exists web_ref_no              text,
  add column if not exists site_url                text,
  add column if not exists account_no              text,
  add column if not exists account_name            text,
  add column if not exists counterparty_bank       text,
  add column if not exists counterparty_account_no text;

comment on column public.transactions.web_image_path is 'ภาพหน้าฝาก/ถอนของเว็บที่อัปโหลดคู่กับสลิป';
comment on column public.transactions.web_ref_no is 'รหัสรายการที่เว็บออกให้ เช่น QR-2737703011042845 — คนละตัวกับ ref_no ที่มาจาก QR บนสลิป';
comment on column public.transactions.site_url is 'โดเมนที่อ่านได้จากภาพหน้าเว็บ เช่น chokddd365.run';
comment on column public.transactions.account_no is 'เลขบัญชีของเรา — ขาฝากคือบัญชีที่โอนออก ขาถอนคือบัญชีที่รับเงิน';
comment on column public.transactions.account_name is 'ชื่อเจ้าของบัญชีของเรา ตามที่หน้าเว็บแสดง';
comment on column public.transactions.counterparty_bank is 'ธนาคารของบัญชีเว็บ (อีกฝั่งของรายการ)';
comment on column public.transactions.counterparty_account_no is 'เลขบัญชีของเว็บ (อีกฝั่งของรายการ)';

-- ใช้กันบันทึกซ้ำเมื่อหน้าเว็บใบเดิมถูกอัปโหลดอีกรอบ (ยังไม่บังคับ unique เพราะเว็บบางแห่งไม่ออกรหัสนี้)
create index if not exists transactions_owner_web_ref_idx
  on public.transactions (owner_id, web_ref_no)
  where web_ref_no is not null;

-- ------------------------------------------------------------
-- ผูกโดเมนกับรายชื่อเว็บ — อ่านโดเมนจากภาพแล้วเลือกเว็บให้อัตโนมัติ
-- ------------------------------------------------------------
alter table public.sites add column if not exists domain text;

comment on column public.sites.domain is 'โดเมนของเว็บ เช่น chokddd365.run — ใช้จับคู่ชื่อเว็บจากภาพหน้าจอ';

create unique index if not exists sites_domain_key
  on public.sites (lower(btrim(domain)))
  where domain is not null;
