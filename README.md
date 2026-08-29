# บัญชีเว็บหวย (lotto-accounting)

เว็บแอปสำหรับบันทึก **เงินเข้าเว็บ** (สลิปโอน) และ **เงินออกจากเว็บ** (แคปหน้าจอถอนสำเร็จ)
กรอกผ่านฟอร์มใน LINE (LIFF) — เลือกเว็บจาก dropdown แล้วอัปโหลดรูป
ระบบอ่าน **วันที่และยอดเงิน** จากรูปให้อัตโนมัติด้วย Google Cloud Vision (หรือ Claude) แล้วเก็บลง Supabase
ดูสรุปยอดรายวัน / รายเดือน / รายเว็บ ได้ทั้งในเว็บและในแชท LINE

---

## ฟีเจอร์

| ส่วน | รายละเอียด |
|---|---|
| แยกผู้ใช้ | หนึ่ง LINE account = หนึ่งชุดข้อมูล ไม่ปนกัน ล็อกอินด้วย LINE Login |
| อนุมัติสมาชิก | คนที่เข้ามาใหม่ต้องรอผู้ดูแลกดอนุมัติที่หน้า `/admin` ก่อนถึงใช้งานได้ |
| สิทธิ์ดูข้ามบัญชี | ผู้ดูแลเลือกได้รายคนว่าให้เห็นเฉพาะบัญชีตัวเอง หรือเห็นสรุปยอดของทุกคน |
| บันทึกรายการ | เลือกประเภท (เข้า/ออก) → เลือกเว็บจาก dropdown → อัปโหลดรูป → ตรวจค่าที่อ่านได้ → บันทึก |
| อ่านรูปอัตโนมัติ | อ่านยอดเงิน วันเวลา เลขอ้างอิง ธนาคาร และชื่อเว็บ พร้อมแปลง พ.ศ. → ค.ศ. ให้เอง |
| กันบันทึกซ้ำ | ทำ sha256 ของไฟล์รูป ถ้าเคยบันทึกสลิปใบเดิมแล้วจะเตือนทันทีก่อนอ่านรูป |
| แก้/ลบได้ | หน้ารายการแก้ยอด วันที่ เว็บ ประเภท และลบพร้อมรูปได้ |
| สรุปยอด | วันนี้ / เมื่อวาน / 7 วัน / รายเดือน / ทั้งปี แยกตามวัน เดือน และเว็บ |
| สรุปใน LINE | พิมพ์ `สรุป`, `เดือนนี้`, `08/2569` ฯลฯ ในแชท แล้วบอทตอบเป็นการ์ดสรุปยอด |
| จัดการเว็บ | เพิ่ม/ปิดใช้/ลบเว็บของตัวเอง นอกเหนือจากเว็บกลางที่มีมาให้ |

**เงินเข้าเว็บ** แสดงด้วยสีแดง (เงินออกจากกระเป๋าเรา) **เงินออกจากเว็บ** แสดงด้วยสีเขียว
`กำไร/ขาดทุน = เงินออกจากเว็บ − เงินเข้าเว็บ`

---

## สิทธิ์การใช้งาน

ระบบแยกสิทธิ์ออกเป็น **3 ชั้นอิสระจากกัน**

| ชั้น | เก็บที่ไหน | ใครเปลี่ยนได้ |
|---|---|---|
| **ผู้ดูแล** | env `LINE_ADMIN_USER_IDS` | แก้ที่การตั้งค่าเซิร์ฟเวอร์เท่านั้น เปลี่ยนผ่านหน้าเว็บไม่ได้ |
| **เข้าใช้งานได้** | คอลัมน์ `app_users.is_active` | ผู้ดูแล กดที่หน้า `/admin` |
| **เห็นข้อมูลทุกคน** | คอลัมน์ `app_users.can_view_all` | ผู้ดูแล กดที่หน้า `/admin` |

### คนใหม่เข้ามาแล้วเกิดอะไรขึ้น

1. ล็อกอิน LINE สำเร็จ → ระบบสร้างแถวใน `app_users` ให้ โดย `is_active = false`
2. เจอหน้า **"รอผู้ดูแลอนุมัติ"** ยังใช้งานอะไรไม่ได้
3. ผู้ดูแลเปิด `/admin` เห็นชื่อในกลุ่ม *รออนุมัติ* → กด **อนุมัติ**
4. คนนั้นกด *เช็คสถานะอีกครั้ง* แล้วใช้งานได้ทันที โดยเห็นเฉพาะข้อมูลของตัวเอง

### สิทธิ์ "เห็นทุกบัญชี"

ค่าเริ่มต้นคือ **เห็นเฉพาะของตัวเอง** — บัญชีของแต่ละคนแยกขาดจากกัน

เปิดสิทธิ์นี้ให้ใครแล้ว คนนั้นจะ

- ✅ เห็น **รายการ** และ **สรุปยอด** ของทุกคนรวมกัน (หน้ารายการจะบอกชื่อเจ้าของแต่ละแถว)
- ✅ เปิดดูรูปสลิปของทุกคนได้
- ❌ **แก้หรือลบรายการของคนอื่นไม่ได้** — ทุก endpoint ที่เขียนข้อมูลยังผูกกับ `owner_id` ของตัวเองเสมอ
- ❌ รายการที่บันทึกใหม่ยังเข้าบัญชีตัวเองตามปกติ

> ⚠️ **ตั้ง `LINE_ADMIN_USER_IDS` ให้เรียบร้อยก่อนรัน migration `0003`**
> ไม่งั้นคนที่เข้ามาใหม่จะค้างอยู่ที่หน้ารออนุมัติโดยไม่มีใครอนุมัติให้ได้
> (ผู้ดูแลถูกเปิดใช้งานอัตโนมัติทุกครั้งที่ล็อกอิน จึงล็อกตัวเองออกไม่ได้)

---

## สถาปัตยกรรม

```
LINE (rich menu / ลิงก์ LIFF)
        │
        ▼
  หน้าเว็บ Next.js (LIFF)  ── liff.getIDToken() ──┐
        │  อัปโหลดรูป (ย่อขนาดในเครื่องก่อน)      │
        ▼                                          ▼
  /api/ocr ─── Google Vision / Claude (OCR)        │  ทุก API ตรวจ ID token
        │                                          │  กับ LINE ก่อนเสมอ
        ├── Supabase Storage (bucket "slips" แบบ private)
        ▼
  /api/transactions ──► Supabase Postgres (RLS เปิด ไม่มี policy)
        ▲
        │
  /api/summary ◄── /api/line/webhook (ตอบสรุปยอดในแชท)
```

- **ฐานข้อมูล** เปิด RLS ไว้และ *ไม่* สร้าง policy → anon key เข้าไม่ถึงข้อมูลเลย
  เว็บเข้าถึงผ่าน `service_role` key ฝั่ง server เท่านั้น และกรอง `owner_id` ของผู้ใช้ที่ผ่านการตรวจ token แล้วทุกครั้ง
- **รูปสลิป** เก็บใน bucket แบบ private เปิดดูผ่าน signed URL อายุ 5 นาที และเช็คว่า path ขึ้นต้นด้วย id ของเจ้าของเสมอ

---

## โครงสร้างไฟล์

```
src/
  app/
    page.tsx                 หน้าบันทึกรายการ (ฟอร์มหลัก)
    summary/page.tsx         หน้าสรุปยอด
    history/page.tsx         หน้ารายการทั้งหมด + แก้ไข/ลบ
    sites/page.tsx           หน้าจัดการเว็บ
    api/
      me/                    ข้อมูลผู้ใช้ปัจจุบัน
      sites/                 รายชื่อเว็บ (GET/POST/PATCH/DELETE)
      ocr/                   รับรูป → เช็คซ้ำ → อัปโหลด → อ่านยอด/วันที่จากรูป
      transactions/          สร้าง/ดึง/แก้/ลบรายการ
      summary/               รวมยอดตามช่วงเวลา
      images/                signed URL ของรูปสลิป
      line/webhook/          webhook ของ LINE Messaging API
  lib/
    ocr.ts                   เลือกตัวอ่านตาม OCR_PROVIDER
    ocr-extraction.ts        schema กลาง + การปรับค่าที่อ่านได้ให้พร้อมลงฟอร์ม
    ocr-google.ts            เรียก Cloud Vision แล้วแกะยอด/วันที่จากข้อความบนสลิป
    ocr-anthropic.ts         prompt + schema สำหรับให้ Claude อ่านรูปตรง ๆ
    thai-date.ts             แปลง พ.ศ./ค.ศ., ตัดยอดตามเวลาไทย, parse วันที่บนสลิป
    summary.ts               รวมยอดรายวัน/รายเดือน/รายเว็บ
    auth.ts                  ตรวจ LINE ID token + หา/สร้างผู้ใช้
    storage.ts               อัปโหลด/ย้าย/ลบรูป
    range.ts                 แปลง query เป็นช่วงเวลา
supabase/migrations/         SQL สร้างตาราง + seed รายชื่อเว็บ
scripts/ocr-smoke.ts         ทดสอบการอ่านรูปจาก command line
scripts/parser-check.ts      ตรวจกติกาการแกะข้อความสลิป (ไม่เรียก API)
```

---

## ติดตั้ง

### 1. Supabase

1. สร้าง project ใหม่ (แนะนำ region `Southeast Asia (Singapore)`)
2. เปิด **SQL Editor** แล้วรันไฟล์ตามลำดับ
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_sites.sql` (รายชื่อเว็บตั้งต้น แก้ชื่อได้ตามใจ)
3. ตรวจว่ามี bucket ชื่อ `slips` แบบ **private** ในเมนู Storage
   (migration สร้างให้แล้ว ถ้าไม่ขึ้นให้กด New bucket แล้วตั้งชื่อ `slips` โดยไม่ติ๊ก Public)
4. คัดลอกค่าจาก **Project Settings → API**
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (ห้ามเอาไปใส่ฝั่ง client)

> ถ้าใช้ Supabase CLI: `supabase db push` จะรัน migration ให้อัตโนมัติ

### 2. LINE Login + LIFF (จำเป็น — ใช้ล็อกอินและกรอกฟอร์ม)

1. เข้า [LINE Developers](https://developers.line.biz/console/) → สร้าง Provider → สร้าง channel แบบ **LINE Login**
2. แท็บ **Basic settings** → คัดลอก `Channel ID` → `LINE_LOGIN_CHANNEL_ID`
3. แท็บ **LIFF** → **Add**
   - Endpoint URL: `https://<โดเมนของคุณ>/`
   - Size: `Full`
   - Scopes: ติ๊ก **profile** และ **openid** (ต้องมี openid ไม่งั้นจะไม่ได้ ID token)
4. คัดลอก `LIFF ID` → `NEXT_PUBLIC_LIFF_ID`

### 3. LINE Messaging API (ไม่บังคับ — ใช้ดูสรุปยอดในแชท)

1. สร้าง channel แบบ **Messaging API** เพิ่ม
2. `Channel secret` → `LINE_MESSAGING_CHANNEL_SECRET`
3. ออก `Channel access token (long-lived)` → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`
4. ตั้ง **Webhook URL** = `https://<โดเมนของคุณ>/api/line/webhook` แล้วเปิด *Use webhook*
5. ปิด *Auto-reply messages* และ *Greeting messages* เพื่อไม่ให้ตอบชนกัน
6. (แนะนำ) ทำ Rich menu ปุ่มเดียวชี้ไปที่ `https://liff.line.me/<LIFF_ID>`

### 4. ตัวอ่านรูป (OCR) — เลือกอย่างใดอย่างหนึ่ง

เลือกได้ที่ `OCR_PROVIDER` (`auto` = มีคีย์ไหนใช้อันนั้น, มีทั้งคู่จะใช้ Google)

**ก. Google Cloud Vision — แนะนำ (1,000 รูปแรกต่อเดือนไม่มีค่าใช้จ่าย)**

1. [Google Cloud Console](https://console.cloud.google.com/) → สร้าง/เลือกโปรเจกต์ → ผูก billing account
   (ต้องผูกบัตรถึงจะเรียก API ได้ แต่ 1,000 รูปแรกของแต่ละเดือนไม่คิดเงิน)
2. **APIs & Services → Library** → เปิดใช้ **Cloud Vision API**
3. **APIs & Services → Credentials → Create credentials → API key**
4. กด **Edit API key** → *API restrictions* → เลือกเฉพาะ **Cloud Vision API**
   (คีย์นี้ใช้ฝั่ง server เท่านั้น ไม่ต้องตั้ง HTTP referrer)
5. ใส่ค่าลง `GOOGLE_VISION_API_KEY`

Vision คืนมาแค่ตัวหนังสือบนรูป ส่วนการแกะ *ยอดเงิน / วันที่ / เลขอ้างอิง* ทำด้วยกฎในโค้ด
([src/lib/ocr-google.ts](src/lib/ocr-google.ts)) จึงไม่มีค่าโมเดลเพิ่ม แต่ความมั่นใจสูงสุดจะอยู่ที่ 0.9

**ข. Claude — แม่นกว่าโดยเฉพาะสลิปแปลก ๆ แต่คิดเงินทุกรูป**

ขอ API key จาก [Anthropic Console](https://console.anthropic.com/) แล้วใส่ `ANTHROPIC_API_KEY`
ปรับรุ่น/ความละเอียดได้ที่ `OCR_MODEL` และ `OCR_EFFORT`

> ไม่ใส่ทั้งคู่ก็ใช้ได้ปกติ แค่ต้องพิมพ์ยอดเงินและวันที่เอง

### 5. รันในเครื่อง

```bash
cp .env.example .env.local     # แล้วเติมค่าให้ครบ
npm install
npm run dev
```

อยากทดสอบโดยไม่ผ่าน LINE ให้ตั้งใน `.env.local`

```
DEV_AUTH_BYPASS=true
NEXT_PUBLIC_DEV_LINE_USER_ID=Utest0001
```

แล้วเปิด http://localhost:3000 ได้เลย (สวิตช์นี้ทำงานเฉพาะตอนไม่ใช่ production)

ทดสอบการอ่านรูปแยกเดี่ยว ๆ

```bash
npx tsx scripts/ocr-smoke.ts ./slip.jpg          # อ่านครบทุกฟิลด์
npx tsx scripts/ocr-smoke.ts ./slip.jpg --text   # ดูข้อความดิบที่ Vision อ่านได้
npx tsx scripts/parser-check.ts                  # ตรวจกติกาการแกะข้อความ ไม่เรียก API
```

สคริปต์อ่านคีย์จาก `.env.local` ให้เอง

---

## Deploy

โปรเจกต์เป็น Next.js มาตรฐาน ไม่ผูกกับผู้ให้บริการรายไหน

**Vercel** — import repo แล้วใส่ environment variables ทั้งหมด กด deploy

**Netlify** — ใช้ `@netlify/plugin-nextjs` (Netlify ตรวจเจอ Next.js ให้อัตโนมัติ)
build command `npm run build` / publish directory `.next`

**Docker**

```bash
docker build -t lotto-accounting \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co \
  --build-arg NEXT_PUBLIC_LIFF_ID=1234567890-abcdefgh \
  --build-arg NEXT_PUBLIC_APP_URL=https://your-domain \
  .
docker run -p 3000:3000 --env-file .env.local lotto-accounting
```

> ค่า `NEXT_PUBLIC_*` ถูกฝังตอน build — ถ้าเปลี่ยนต้อง build ใหม่

หลัง deploy แล้วอย่าลืมกลับไปแก้ **Endpoint URL ของ LIFF** และ **Webhook URL** ให้ตรงกับโดเมนจริง

---

## คำสั่งในแชท LINE

| พิมพ์ | ได้ |
|---|---|
| `สรุป` หรือ `วันนี้` | ยอดวันนี้ แยกตามเว็บ |
| `เมื่อวาน` | ยอดเมื่อวาน |
| `เดือนนี้` | ยอดเดือนนี้ แยกตามเว็บ |
| `รายวัน` | ยอดเดือนนี้ แยกตามวัน |
| `7 วัน` / `30 วัน` | ยอดย้อนหลัง แยกตามวัน |
| `08/2569` หรือ `2026-08` | ยอดของเดือนที่ระบุ (ใส่ พ.ศ. ได้) |
| อย่างอื่น | ข้อความช่วยเหลือ |

---

## หมายเหตุ

- **จำกัดคนใช้** ตั้ง `LINE_ALLOWED_USER_IDS` เป็น LINE userId คั่นด้วย comma
  ถ้าไม่ตั้ง ใครล็อกอินก็ใช้ได้ แต่ข้อมูลของแต่ละคนแยกขาดจากกันอยู่แล้ว
- **โซนเวลา** ตัดยอดตาม `Asia/Bangkok` ทั้งระบบ (คอลัมน์ `occurred_date` ในฐานข้อมูลก็ยึดโซนนี้)
- **ไฟล์ค้าง** รูปที่อัปโหลดแล้วผู้ใช้ไม่กดบันทึกจะค้างอยู่ที่ `<user-id>/tmp/` ใน bucket
  ลบทิ้งเป็นระยะได้ตามสะดวก (ไฟล์ที่บันทึกแล้วจะถูกย้ายไปโฟลเดอร์ตามเดือน)
- **ขนาดไฟล์รูป** หน้าเว็บย่อรูปให้เหลือด้านยาวสุด 1600px ก่อนอัปโหลดอยู่แล้ว (ปกติไม่ถึง 1 MB)
  ฝั่ง server จำกัดไว้ที่ 8 MB แต่ถ้า deploy บน serverless บางเจ้าจะจำกัด request body ราว 4.5 MB — ยังเหลือที่เหลือเฟือ
- **ค่าใช้จ่ายการอ่านรูป** Google Vision ฟรี 1,000 รูป/เดือน (เกินจากนั้นคิดเป็นรายพันรูป)
  ส่วน Claude คิดเงินทุกรูป — สลับได้ที่ `OCR_PROVIDER` และปรับรุ่นที่ `OCR_MODEL` / `OCR_EFFORT`
- ยอดที่อ่านได้จากรูป **ควรตรวจก่อนกดบันทึกทุกครั้ง** — หน้าฟอร์มจะแสดงระดับความมั่นใจและคำเตือนไว้ให้
