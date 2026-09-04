# ข้อตกลงของโปรเจกต์นี้

> 📌 **กำลังย้ายทุกอย่างจากแอป Streamlit (`lottery-app`) มาอยู่ที่นี่ที่เดียว** (ก.ย. 2569)
> แผน · สถานะ · ขั้นตอนต่อไป อยู่ที่ [`docs/ย้ายมาอยู่ที่นี่ที่เดียว.md`](docs/ย้ายมาอยู่ที่นี่ที่เดียว.md)
> — **session ใหม่อ่านไฟล์นั้นก่อน** แล้วจะรู้ว่าค้างอยู่ตรงไหน

## บัญชีและขอบเขต

- **GitHub**: `piranya007haaah` (บัญชี hobby) — repo `piranya007haaah/lotto-accounting`
  พัฒนาและ push บน branch `claude/lottery-deposit-tracker-w3lhhu`
- **Supabase**: โปรเจกต์นี้ใช้ Supabase **คนละบัญชีกับ lubewatch**

## ห้ามยุ่งกับ lubewatch

`lubewatch` เป็นคนละแอปและอยู่คนละบัญชี Supabase — **ห้ามอ่าน เขียน หรือรัน migration
ใส่โปรเจกต์นั้นเด็ดขาด** และห้ามเอา URL / key / project ref ของ lubewatch มาใส่ในโค้ดหรือ env ของที่นี่

ถ้า Supabase MCP ในเซสชันไหน login อยู่กับบัญชีของ lubewatch ให้ถือว่า **เข้าไม่ถึงฐานข้อมูลของโปรเจกต์นี้**
— ให้ส่ง SQL migration ให้เจ้าของไปรันเองใน SQL Editor ของบัญชีที่ถูกต้อง อย่าไปสร้างตารางในโปรเจกต์ที่มองเห็นแทน

## ต่อ Supabase MCP ให้ตรงบัญชี (ไม่ผ่าน connector ของ claude.ai)

connector Supabase ของ claude.ai ผูกกับ **บัญชีที่ล็อกอินอยู่** ซึ่งบางเซสชันคือบัญชีของ
lubewatch ⇒ มองไม่เห็นโปรเจกต์นี้เลย · แก้ด้วย MCP server แบบ **stdio + Personal Access
Token** ที่ `.mcp.json` (project scope) — ลำดับความสำคัญของ Claude Code คือ
local > **project** > user > plugin > **claude.ai connector** ⇒ ตัวนี้ชนะ connector

- `.mcp.json` **ห้ามใส่ token จริง** — ใช้ `${SUPABASE_ACCESS_TOKEN}` / `${SUPABASE_PROJECT_REF}`
  แล้วตั้งค่าจริงเป็น environment variable ของ environment (Claude Code on the web:
  Settings → Environments) หรือ export เองตอนรันในเครื่อง
- ออก token ที่ Supabase Dashboard → Account → Access Tokens · ใช้ **scoped token**
  (`sbp_fc…`) จำกัดเฉพาะโปรเจกต์นี้ได้ ปลอดภัยกว่า token เต็มบัญชี
- `--project-ref` ทำให้ MCP แตะได้โปรเจกต์เดียว (เครื่องมือระดับบัญชีปิดหมด)
  · เพิ่ม `--read-only` ได้ถ้าอยากให้ query อ่านอย่างเดียว (migration จะรันไม่ได้)
- server ใหม่ **ต้องรีสตาร์ทเซสชัน + กดอนุมัติ** ครั้งแรก ถึงจะเชื่อมต่อ

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

## engine หวย 2 ตัวฝั่ง TypeScript (`src/lib/lottery/`)

หน้า "เลือกสูตร" กำลังย้ายมาที่นี่ ⇒ **ที่นี่ต้องคำนวณเองได้** (ต่างจากพอร์ตด้านบนที่รับ
snapshot มาวาดอย่างเดียว) · ของสองอย่างนี้อย่าสับสนกัน:

| | พอร์ต (`/portfolio`) | สูตร (`/formulas` · ยังไม่ได้ทำหน้าจอ) |
|---|---|---|
| ตัวเลขมาจาก | snapshot ที่ Python ส่งมา | คำนวณสดที่นี่ด้วย `engine.ts` |
| ห้ามทำ | คำนวณใหม่เอง | อ่านค่าจาก snapshot (คนละเรื่องกัน) |

- `formulas.ts` = สูตร 5 ตัว (พอร์ตของสูตร 2 ตัว) · `engine.ts` = `runAllSizes` /
  `equityCurve` / `computeRiskMetrics` / `randomBaseline`
- ⚠️⚠️ **ต้องให้ตัวเลขตรงกับ Python เป๊ะ** ตราบใดที่ Streamlit ยังไม่ถูกยุบ —
  `npx tsx scripts/formula-check.ts` เทียบกับเฉลยจริง (`__fixtures__/engine-golden.json`)
  **2,460 จุด ต้องผ่านหมด** · เฉลยสร้างใหม่ได้ที่ฝั่งโน้นด้วย
  `python3 scripts/export_engine_fixture.py`
- ⚠️ **`round()` ของ Python ปัดครึ่งไปหาเลขคู่** (banker's rounding) ไม่เหมือน `Math.round`
  ⇒ ต้องใช้ `pyRound()` ใน `engine.ts` ทุกที่ที่ Python ปัด — ใช้ `Math.round` ตรง ๆ
  แล้วเลขจะเพี้ยนทีละบาทแบบหาไม่เจอ · `pyRound` normalize `-0` เป็น `0` ด้วย
- ⚠️ **`%` ของ JS ให้ค่าติดลบได้** (ต่างจาก Python) — สูตรที่เดินเลขถอยหลังต้อง
  `((x % 100) + 100) % 100` ไม่งั้นได้เลขติดลบเงียบ ๆ

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
