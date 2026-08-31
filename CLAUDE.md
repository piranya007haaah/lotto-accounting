# ข้อตกลงของโปรเจกต์นี้

## บัญชีและขอบเขต

- **GitHub**: `piranya007haaah` (บัญชี hobby) — repo `piranya007haaah/lotto-accounting`
  พัฒนาและ push บน branch `claude/lottery-deposit-tracker-w3lhhu`
- **Supabase**: โปรเจกต์นี้ใช้ Supabase **คนละบัญชีกับ lubewatch**

## ห้ามยุ่งกับ lubewatch

`lubewatch` เป็นคนละแอปและอยู่คนละบัญชี Supabase — **ห้ามอ่าน เขียน หรือรัน migration
ใส่โปรเจกต์นั้นเด็ดขาด** และห้ามเอา URL / key / project ref ของ lubewatch มาใส่ในโค้ดหรือ env ของที่นี่

ถ้า Supabase MCP ในเซสชันไหน login อยู่กับบัญชีของ lubewatch ให้ถือว่า **เข้าไม่ถึงฐานข้อมูลของโปรเจกต์นี้**
— ให้ส่ง SQL migration ให้เจ้าของไปรันเองใน SQL Editor ของบัญชีที่ถูกต้อง อย่าไปสร้างตารางในโปรเจกต์ที่มองเห็นแทน

## การตั้งค่า

ค่าเชื่อมต่อทั้งหมดอ่านจาก environment variables (`.env.example` เป็นตัวอย่าง)
ห้าม hardcode URL, key หรือ project ref ของ Supabase ลงในโค้ด

## คำสั่งที่ใช้บ่อย

```bash
npm run dev         # รันในเครื่อง (ตั้ง DEV_AUTH_BYPASS=true เพื่อข้าม LINE Login)
npm run build       # ตรวจว่า build ผ่านก่อน commit
npm run typecheck   # tsc --noEmit
npx tsx scripts/ocr-smoke.ts ./slip.jpg   # ทดสอบอ่านรูปจริง (อ่านคีย์จาก .env.local ให้เอง)
npx tsx scripts/parser-check.ts           # ตรวจกติกาการแกะข้อความสลิป ไม่เรียก API
npx tsx scripts/pair-check.ts             # ตรวจการอ่านหน้าเว็บ + การจับคู่กับสลิป ไม่เรียก API
```

SQL อยู่ที่ `supabase/migrations/` — รันเรียงตามเลขไฟล์

## พอร์ตหวยจากแอป Streamlit (หน้า `/portfolio` · ผู้ดูแลเท่านั้น)

ตัวเลขพอร์ต (เส้นทุน · กำไรรายเดือน · Max DD · Loss streak) เกิดจาก engine backtest
ภาษา Python ในรีโป `piranya007haaah/lottery-app` — **ที่นี่คำนวณเองไม่ได้และห้ามคำนวณใหม่**
(คำนวณซ้ำ = สองแอปโชว์คนละเลขโดยไม่มีใครรู้) ฝั่งโน้นคำนวณเสร็จแล้ว POST snapshot มาเก็บ

- `POST /api/portfolio/snapshot` — auth ด้วย header `x-snapshot-secret` เทียบกับ
  `PORTFOLIO_SNAPSHOT_SECRET` แบบ timing-safe · **ไม่ตั้ง env = ปิดรับ** (ไม่ใช่รับใครก็ได้)
- `GET` ตัวเดียวกัน — `requireAdmin` เท่านั้น (พอร์ตเป็นเงินของเจ้าของคนเดียว)
- ตาราง `portfolio_snapshots` (migration `0008`) — 1 แถว = 1 พอร์ต · ส่งซ้ำ = ทับของเดิม
  · เก็บเป็น `jsonb` ทั้งก้อน ไม่แตกคอลัมน์ (ฝั่งโน้นเพิ่มตัวเลขแล้วไม่ต้องตามแก้ schema)
- `src/lib/portfolio-snapshot.ts` = ตรวจด้วย zod แล้วแปลง snake_case → camelCase
  **ครั้งเดียวตอนรับ** แล้วเก็บรูปที่แปลงแล้ว ⇒ ข้อมูลผิดรูปถูกปฏิเสธตั้งแต่ประตู
  · `version` ใหม่กว่า `SUPPORTED_SNAPSHOT_VERSION` = ตอบ 409 ไม่ใช่เก็บมั่ว
- ⚠️⚠️ index ของ `equity.values` = **วันปฏิทินนับจาก 1 ม.ค.** ไม่ใช่ "งวดที่" (วันหยุดก็มี
  จุดของมัน เส้นแค่แบนราบ) ⇒ เส้นแบ่งเดือนต้องใช้ `equity.monthDivs` ที่ส่งมาเท่านั้น
  ห้ามหารความยาวด้วย 12 เอง — กติกาเดียวกับฝั่ง Python (`db.mask_months`)
- กราฟวาดด้วย SVG เองใน `src/components/PortfolioCharts.tsx` (ไม่ลง chart library)
  · ⚠️ สีเขียว/แดงของแอปนี้ **แยกไม่ออกด้วยตาบอดสีเขียว-แดง** (วัดแล้ว ΔE 5.2 deutan)
  ⇒ บาร์กำไรรายเดือน/รายขาใช้ **ทิศทาง** (ขวา = กำไร · ซ้าย = ขาดทุน) + เครื่องหมาย +/−
  เป็นตัวบอกความหมาย สีเป็นของแถม — ห้ามแก้ให้เหลือสีอย่างเดียว

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
