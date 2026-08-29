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
npx tsx scripts/ocr-smoke.ts ./slip.jpg   # ทดสอบการอ่านรูปแยกเดี่ยว ๆ (อ่านคีย์จาก .env.local)
npx tsx scripts/parser-check.ts           # ตรวจกติกาการแกะข้อความสลิป ไม่เรียก API
```

SQL อยู่ที่ `supabase/migrations/` — รันเรียงตามเลขไฟล์

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
