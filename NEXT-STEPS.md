# งานที่ค้างอยู่ — ตัวอ่านสลิป (QR + Google Vision)

> โน้ตส่งงานจากเซสชันบนเว็บ มาทำต่อในเครื่อง
> อ่านไฟล์นี้ก่อนเริ่ม แล้วลบทิ้งได้เมื่องานจบ
> branch: `claude/slip-reader-without-api-tmor3g`

---

## สถานะตอนนี้

โค้ดเสร็จและ push แล้ว 3 commit — `npm run build` กับ `npm run typecheck` ผ่านทั้งคู่

```
5a5767e  ตัดชั้น Claude ออก เหลือ QR + Google Vision
8102706  เปลี่ยนมาอ่านยอดเงิน/วันที่ด้วย Google Cloud Vision แทน Claude
c425801  เพิ่มตัวอ่าน QR ตรวจสอบสลิป
```

**สิ่งที่ยังไม่ได้ทำคือทดสอบกับ Google Vision จริง** — ยังไม่เคยมี API key จึงยังไม่เคยเห็น
output จริงของ Vision เลยสักครั้ง (ดูหัวข้อ "สิ่งที่ยังไม่เคยพิสูจน์" ด้านล่าง)

---

## อ่านสลิปยังไง

สองชั้น ชั้นแรกฟรีและแม่นกว่า จึงชนะเสมอเมื่อค่าชนกัน

| ชั้น | ไฟล์ | ได้อะไร | ค่าใช้จ่าย |
|---|---|---|---|
| 1. QR ตรวจสอบสลิป | `src/lib/slip-qr.ts` | เลขที่รายการ, ธนาคารต้นทาง, กันสลิปซ้ำ | ฟรี (ในเครื่อง ~200 ms) |
| 2. Google Cloud Vision | `src/lib/google-vision.ts` | ยอดเงิน, วันเวลา, เข้า/ออก, ชื่อเว็บ | 1,000 ภาพแรก/เดือนฟรี |

ไฟล์อื่นที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/slip-text.ts` | **แยกฟิลด์ออกจากข้อความ OCR — จุดที่จะต้องแก้บ่อยที่สุด** |
| `src/lib/ocr.ts` | ร้อยสองชั้นเข้าด้วยกันเป็นผลชุดเดียว (116 บรรทัด) |
| `src/lib/thai-banks.ts` | รหัสธนาคาร 3 หลัก → ชื่อธนาคารไทย |
| `src/app/api/ocr/route.ts` | รับรูป → ถอด QR → เช็คซ้ำ → อัปโหลด → อ่าน |

`slip-text.ts` แยกออกมาจากตัวเรียก API โดยตั้งใจ — ทดสอบด้วยข้อความดิบได้โดยไม่ต้องต่อเน็ต
และเปลี่ยนตัว OCR ข้างหลังได้โดยไม่ต้องแก้ตรรกะ

**ไม่ต้องรัน migration ใด ๆ** งานรอบนี้ไม่ได้แตะฐานข้อมูลเลย

---

## ขั้นตอนที่ต้องทำต่อ

### 1. เอา Google Vision API key

ค้างอยู่ตรงหน้าสร้าง API key พอดี

1. สร้าง/เลือกโปรเจกต์ — https://console.cloud.google.com/projectcreate
2. **ผูก billing** — https://console.cloud.google.com/billing
   Vision บังคับมี billing account แม้จะใช้แค่โควตาฟรี ไม่ผูกบัตร = ได้ 403 แม้ key ถูก
   (โควตา 1,000/เดือนยังฟรีอยู่ บัญชีใหม่ได้เครดิต $300 ใช้ได้ 90 วันด้วย)
3. **เปิดใช้ Cloud Vision API** — https://console.cloud.google.com/apis/library/vision.googleapis.com
   ต้องทำก่อนขั้นถัดไป ไม่งั้นจะไม่เห็น Cloud Vision API ในลิสต์ตอนสร้าง key
4. สร้าง key — https://console.cloud.google.com/apis/credentials
   → *Create credentials* → *API key*
5. จำกัดสิทธิ์ key
   - **API restrictions** → *Restrict key* → ติ๊กเฉพาะ **Cloud Vision API**
   - **อย่าติ๊ก** "Authenticate API calls through a service account" — อันนั้นสำหรับ Vertex/Gemini
     ส่วน Vision ใช้ API key เปล่า ๆ ได้ ถ้าติ๊กไปโค้ดนี้จะเรียกไม่ได้
   - **Application restrictions** → ตอน dev ใช้ *None* ไปก่อนได้
     ตอน deploy ค่อยเปลี่ยนเป็น *IP addresses* ใส่ IP เซิร์ฟเวอร์
     (อย่าเลือก *Websites* / HTTP referrers — key นี้ใช้ฝั่ง server)
6. ตั้ง budget alert — https://console.cloud.google.com/billing/budgets
   ที่ 1000+ สลิป/เดือนจะอยู่พอดีขอบโควตาฟรี ส่วนเกินคิด $1.50/1,000 ภาพ

### 2. รันในเครื่อง

```bash
cd ~/lotto-accounting        # ถ้ายังไม่มี: git clone https://github.com/piranya007haaah/lotto-accounting.git
git fetch origin claude/slip-reader-without-api-tmor3g
git checkout claude/slip-reader-without-api-tmor3g
npm install                  # มี jsqr กับ sharp เพิ่มเข้ามา (sharp เป็น native binary ใช้เวลาสักครู่)
```

เติมใน `.env.local`

```
GOOGLE_VISION_API_KEY=AIza...
```

### 3. ทดสอบกับสลิปจริง — **ขั้นตอนที่สำคัญที่สุด**

```bash
npx tsx scripts/ocr-smoke.ts ./slip.jpg                            # QR อย่างเดียว ไม่เรียก API
GOOGLE_VISION_API_KEY=AIza... npx tsx scripts/ocr-smoke.ts ./slip.jpg   # เส้นทางจริง
```

ที่ควรเห็น: `sources = qr → vision` พร้อม `amount`, `occurredAtLocal`, `refNo`, `bankName` ครบ

**ทดสอบให้ครอบคลุม**

- สลิปจากธนาคารต่างกันอย่างน้อย 5 ธนาคาร (กสิกร, ไทยพาณิชย์, กรุงเทพ, กรุงไทย, ทรูมันนี่)
- **หน้าจอถอนเงินจากเว็บ 2–3 รูป** ← เสี่ยงสุด เพราะแต่ละเว็บหน้าตาไม่เหมือนกันและไม่มี QR ให้ยึด
- สลิปที่มีค่าธรรมเนียมไม่เป็นศูนย์
- สลิปที่โชว์ยอดคงเหลือ (ต้องไม่หยิบยอดคงเหลือมาเป็นยอดโอน)

**ถ้าใบไหนอ่านผิดหรือได้ `null`** → ดู `raw.vision.text` ใน output นั่นคือข้อความดิบที่ Vision อ่านได้
เอามาปรับ regex/ป้ายกำกับใน `src/lib/slip-text.ts` แล้วทดสอบซ้ำได้โดยไม่ต้องยิง API

### 4. เปิดเว็บจริง

```bash
npm run dev     # ใส่ DEV_AUTH_BYPASS=true ใน .env.local ถ้าจะข้าม LINE Login
```

### 5. ตอน deploy

`GOOGLE_VISION_API_KEY` เป็น **runtime env** ไม่ใช่ build arg — ไม่ต้องแก้ Dockerfile

```bash
docker run -e GOOGLE_VISION_API_KEY=AIza... ...
```

แล้วกลับไปเติม IP เซิร์ฟเวอร์ใน Application restrictions ของ key

---

## สิ่งที่ยังไม่เคยพิสูจน์ — อ่านก่อนเชื่อโค้ดนี้

1. **ยังไม่เคยเรียก Google Vision จริงสักครั้ง** ทดสอบด้วยการ stub `fetch` เท่านั้น
   (ครอบ 4 กรณี: ปกติ / คืนแต่ `textAnnotations` / error รายภาพ / โควตาหมด 403)
   รูปร่าง request กับ response อ้างจากเอกสาร Google แต่หน้า reference โดน egress บล็อก
   ในเซสชันนั้น จึงเขียน client ให้รับได้ทั้ง `fullTextAnnotation.text` และ `textAnnotations[0].description`
2. **ความแม่นของ Vision กับภาษาไทยยังไม่รู้ตัวเลขจริง** ตัวแยกฟิลด์ทดสอบมาจากข้อความที่
   Tesseract อ่านได้ (สลิป K PLUS ใบเดียว) บวกเคสที่แต่งขึ้น 7 เคส ผ่านหมด แต่ยังไม่ใช่ของจริง
3. **หน้าจอถอนเงินจากเว็บยังไม่เคยเห็นสักรูป** ตรรกะจับทิศทางใช้แค่คำว่า "ถอน" ในข้อความ
   ตรงนี้น่าจะต้องปรับหลังเห็นของจริง

---

## สิ่งที่พิสูจน์แล้ว

ทดสอบกับสลิป K PLUS จริงในเซสชันนั้น

- **ถอด QR ได้ทุกกรณี** ต้นฉบับ / PNG / WebP / ย่อเหลือ 500px / หมุน 90° / เอียง 6° — ใช้เวลา 50–400 ms
- **ปฏิเสธถูกต้อง** รูปไม่มี QR, ไฟล์เสีย, QR พร้อมเพย์รับเงิน, payload ที่ CRC ผิด → คืน `null`
- **ตัวแยกฟิลด์ผ่าน 7 เคส** รวมกับดักยอดคงเหลือ 87,204.55 อยู่ใต้ยอดโอน 1,500.00 → หยิบ 1,500 ถูก
- `27 ส.ค. 69` → `2026-08-27` และ `2026-08-27` ไม่โดนลบ 543 ซ้ำ

---

## หมายเหตุการออกแบบ (เผื่ออยากรื้อ)

- **ทำไมเก็บชั้น QR ไว้ ไม่ใช้ Vision อย่างเดียว** — เลขที่รายการเป็นสตริง 20 ตัวปนเลขกับอักษร
  (`016239094536DPP01537`) ซึ่งเป็นจุดที่ OCR พลาดง่ายสุด (0↔O, 1↔I) และเลขนี้คือกุญแจ
  **กันบันทึกสลิปซ้ำ** อ่านพลาดตัวเดียว = จับใบซ้ำไม่ได้ = ยอดเงินซ้ำในบัญชี
  ส่วน QR ถอดตรง ๆ พร้อม CRC ให้ตรวจ จึงไม่มีทางเพี้ยน
- **กันสลิปซ้ำสองชั้น** sha256 ของไฟล์ (ของเดิม) + เลขที่รายการจาก QR (ของใหม่)
  ชั้นที่สองจับใบที่ครอปหรือบีบอัดใหม่จน hash เปลี่ยนได้ และตัดก่อนยิง Vision จึงประหยัดโควตาด้วย
- **Claude ถูกตัดออกแล้ว** เคยมีเป็นชั้นที่ 3 แต่ไม่คุ้ม เพราะใบที่อ่านไม่ครบ ฟอร์มให้กรอกเองได้อยู่แล้ว
  ถ้าอยากได้กลับ ดู commit `8102706`

---

## ถ้าเจอ error

| อาการ | สาเหตุ |
|---|---|
| `Cannot find module '.../scripts/ocr-smoke.ts'` | ยังไม่ได้ `cd` เข้าโฟลเดอร์โปรเจกต์ — `pwd` ต้องลงท้ายด้วย `/lotto-accounting` |
| 403 จาก Vision ทั้งที่ key ถูก | ยังไม่ได้ผูก billing account หรือยังไม่ได้ Enable Cloud Vision API |
| ไม่เห็น Cloud Vision API ตอนสร้าง key | ยังไม่ได้ Enable — เปิดแล้ว refresh หน้า credentials ใหม่ |
| `sources = qr` เฉย ๆ ไม่มี `vision` | ไม่ได้ตั้ง `GOOGLE_VISION_API_KEY` หรือ Vision โยน error (ดู log ในเทอร์มินัล) |
