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
npx tsx scripts/formula-check.ts          # engine หวยตรงกับ Python ไหม (2,460 จุด)
npx tsx scripts/rank-check.ts             # การเลือก n_bet/จัดอันดับตรงกับ Python ไหม (1,080 จุด)
```

SQL อยู่ที่ `supabase/migrations/` — รันเรียงตามเลขไฟล์

## พอร์ตหวยจากแอป Streamlit (หน้า `/portfolio` · ต้องมีสิทธิ์ดูหน้าหวย)

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

## engine พอร์ตฝั่ง TypeScript (`src/lib/lottery/portfolio-engine.ts`)

`computeSnapshot({portfolio, sequences})` คำนวณพอร์ตทั้งก้อน**เองที่นี่** → คืน `PortfolioSnapshot`
รูปเดียวกับที่ Python เคย POST มา (พอร์ตมาจาก `replay_portfolio` / `run_portfolio` /
`build_snapshot` ของ lottery-app) ⇒ กราฟและหน้าจอเดิมวาดต่อได้ทันที
· โหลดผลหวยที่ต้องใช้ด้วย `requiredSequenceKeys()` ก่อนเสมอ

- ⚠️⚠️ **ต้องตรงกับ Python เป๊ะ** — `npx tsx scripts/portfolio-check.ts` เทียบกับเฉลยจริง
  **1,920 จุด (12 พอร์ต · 49 ขา)** ต้องผ่านหมด · เฉลยสร้างที่ฝั่งโน้น:
  `python3 scripts/export_portfolio_fixture.py --out <ที่นี่>/src/lib/lottery/__fixtures__/portfolio-golden.json`
- เฉลยมี **พอร์ตสมมุติ (id 9001-9004)** ปนอยู่ด้วย เพราะพอร์ตจริงทั้ง 8 ใช้แค่โหมด
  `manual`/`rank` ⇒ ถ้าเอาแต่ของจริง ทางเดิน `fixed_n` / `auto` / `train_months` /
  `test_months` / ขาที่รันไม่ได้ / PF=∞ จะไม่ถูกตรวจเลย — **อย่าลบทิ้ง**
- ⚠️⚠️ index ของ sequence = **วันปฏิทินจาก 1 ม.ค.** — กรองเดือนด้วย `maskMonths`
  (ปิดวันอื่นเป็น `--`) **ห้ามตัดสตริงให้สั้นลง** · `legBetAt(detail, step)` เท่านั้นที่ให้
  "เลขของเดือนนั้น" · งวดที่ n=0 (เดือนที่ไม่ได้ตั้งเลข) **ไม่นับเป็นงวดที่แพ้**
- ⚠️ วันที่ทุกจุดใช้ `Date.UTC` ล้วน (`new Date(y,m,d)` เป็นเวลาท้องถิ่น → DST ทำให้วันขยับ
  1 วัน ชุดเลขรายเดือนเลื่อนทั้งเส้น) · `Math.trunc` = `int()` · `pyRound` = `round()` คนละที่กัน
- ⚠️ `asOf` ("ข้อมูลถึง") คิดจาก **ปีที่โหลดมาให้เท่านั้น** ส่วน Python มองทุกปีใน DB —
  ตรงกันตราบใดที่ปี test คือปีล่าสุดของหวยนั้น (ตัว export เตือนเองถ้าไม่ใช่)

## ตั้งค่าพอร์ตอยู่ที่นี่แล้ว (`lottery_portfolios` · `/api/lottery/portfolios`)

ตาราง `lottery_portfolios` (migration `0011`) = **ตัวตั้งค่าพอร์ต** (legs/ทุน/เงินแทง)
คนละเรื่องกับ `portfolio_snapshots` (migration `0008`) ที่เป็น *ผลที่คำนวณแล้ว* จาก Python

- นำเข้าครั้งแรกจากฝั่งโน้น: `python3 scripts/sync_to_supabase.py --portfolios`
  ⚠️⚠️ **หลังนำเข้าแล้วตารางนี้เป็นเจ้าของข้อมูล** — POST ดีฟอลต์ "มีแล้วข้าม"
  ต้องพิมพ์ `--replace` เองถึงจะทับ ไม่งั้น sync รอบหน้าจะลบสิ่งที่เพิ่งแก้ในเว็บทิ้งเงียบ ๆ
- `GET` รับ **2 ทาง**: `requireLotteryViewer` (คนที่ล็อกอิน) หรือ `X-Snapshot-Secret`
  (สคริปต์ฝั่ง Python อ่านพอร์ตกลับไปทำรายงาน LINE) · secret ผิด = 401 ทันที
  **ไม่ตกไปเป็น viewer** · `PUT` = `requireAdmin` (แก้พอร์ตได้เฉพาะเจ้าของ)
- ⚠️ **zod `.optional()` ไม่รับ `null`** ที่ `json.dumps(None)` ของ Python สร้าง —
  เคยทำพอร์ตจริงตกไป 4 จาก 8 ตัวเพราะ `train_months: null` · `portfolio-config.ts` มี
  helper `nullable()` ครอบไว้แล้ว **คีย์ใหม่ที่เป็น None ได้ต้องครอบด้วยทุกครั้ง**
- ผลหวย **3 ตัว** อยู่ตาราง `lottery_datasets` เดียวกัน แยกด้วยคอลัมน์ `digits`
  (2 = สองบน/สองล่าง · 3 = สามบน) — sync ส่งมาให้แล้ว

## ใครเห็นโหมดหวยได้บ้าง (`can_view_lottery`)

โหมด 🎲 หวย (พอร์ต + สูตร) โชว์ **เงินจริงของเจ้าของ** จึงไม่ได้เปิดให้ทุกคนที่ล็อกอินได้
— ผู้ดูแลเปิดให้ทีละคนที่หน้า `/admin` (ปุ่ม "🎲 เห็นหน้าหวย")

- คอลัมน์ `app_users.can_view_lottery` (migration `0010`) · ดีฟอลต์ `false`
  · **ผู้ดูแลได้สิทธิ์นี้เองเสมอ** ในโค้ด (`auth.ts`) ไม่ต้องติ๊กให้ตัวเอง
- API ของโหมดหวยใช้ `requireLotteryViewer` ไม่ใช่ `requireAdmin`
  (`/api/lottery/*` · `GET /api/portfolio/snapshot`) — ส่วน `/api/admin/*` ยังเป็น admin เหมือนเดิม
- ไม่มีสิทธิ์ = **ไม่เห็นแม้แต่ปุ่มสลับโหมด** (`modesFor` กรองให้) ไม่ใช่เห็นปุ่มแล้วกดเข้าไปเจอ 403
- ⚠️ ยังไม่ได้รัน migration `0010` = ทุกอย่างทำงานตามปกติ (ถือว่าไม่มีใครมีสิทธิ์ ยกเว้นผู้ดูแล)
  แต่กดปุ่มเปิดสิทธิ์แล้วจะได้ **503 พร้อมชื่อไฟล์ migration** — ตั้งใจให้บอกตรง ๆ
  ดีกว่าปุ่มกดแล้วเงียบ · กติกาเดียวกับ `pairColumnsReady` ของ migration 0007

## หน้าพอร์ต `/portfolio` — 2 แท็บ: 📊 ผลย้อนหลัง · ✏️ แก้ตั้งค่า

เลือกพอร์ตจาก `lottery_portfolios` → แก้ → บันทึกทั้งก้อนด้วย `PUT /api/lottery/portfolios`
· **แก้ได้เฉพาะ `isAdmin`** คนที่มีแค่ `canViewLottery` เห็นเฉพาะผลย้อนหลัง (ไม่มีแท็บให้)

- **สร้าง/ลบพอร์ตได้ที่นี่แล้ว** (ผู้ใช้ขอเอง ก.ย. 2569) — `➕ พอร์ตใหม่` ข้างแถบชื่อพอร์ต
  · `PUT` ที่ไม่ส่ง `id` = พอร์ตใหม่ (API ตั้งเลขต่อจาก id ที่มากสุด) · `DELETE ?id=` = ลบ
  ⚠️ **ลบพอร์ตต้องลบแถวใน `portfolio_snapshots` ด้วย** ไม่งั้น `GET /api/portfolio/snapshot`
  แบบไม่ระบุ id จะหยิบแถวแรกที่เจอ = โชว์ตัวเลขของพอร์ตที่ลบไปแล้ว
- **เพิ่ม/ลบขาได้ที่นี่แล้ว** — ขาที่เพิ่มเป็นโหมด `manual` เสมอ (`newManualLeg`) เพราะขาโหมด
  สูตรต้องมีปีเทรน + อันดับ + รัน `runAllSizes` ถึงจะรู้ `n_bet` · เลือกหวย/ตำแหน่งจาก
  **รายการจริงในตาราง** (`LegPicker`) ห้ามให้พิมพ์เอง — ชื่อต้องตรงเป๊ะ ไม่งั้นขานั้นหาผลหวยไม่เจอ
  · `digits` อ่านจากคอลัมน์ของตาราง ไม่ใช่เดาจากชื่อตำแหน่ง
- ⚠️ ที่ยัง**ไม่มี**โดยตั้งใจ: เปลี่ยนหวย/ตำแหน่ง/ปีของขาเดิม · เปลี่ยนสูตร/อันดับ — เปลี่ยนหวย/ปี
  = คนละขากันแล้ว ⇒ ลบขาแล้วเพิ่มใหม่ · ขาโหมดสูตรยังตั้งที่แอปเดิม
- ⚠️⚠️ ขารายเดือน (`manual_months`): เดือนที่ไม่มีคีย์ = **ไม่แทงเดือนนั้น** (n=0 · ต้นทุน 0)
  `leg-utils.setMonthlyNumbers` เป็นที่เดียวที่เขียนค่าพวกนี้ — `manual_nums` = เลขรวมทุกเดือน ·
  `n_bet` = เดือนที่แทงเยอะสุด (worst case ของต้นทุน)
- ตัวเลข/กราฟมาจาก `computeSnapshot()` คำนวณสด (รวมของที่ยังไม่บันทึก — บอกไว้บนจอ) ·
  engine โยน error = โชว์ "ยังคำนวณสดไม่ได้" แล้วตกไปใช้ snapshot เก่าจาก Streamlit
  พร้อมป้ายบอกว่าเป็นเลขของแอปเดิม — **ห้ามเดาตัวเลขเอง**
- ปุ่มบันทึกเป็นแถบลอยเหนือเมนูล่าง โผล่เฉพาะตอนมีของค้าง (เทียบด้วย `stableJson` ที่เรียงคีย์
  ไม่งั้นการลบ/ใส่คีย์ `manual_months` กลับจะขึ้นว่า "ยังไม่บันทึก" ทั้งที่เนื้อในเหมือนเดิม)
- ⚠️ ขาที่ตารางผลหวย **ยังไม่มีหวย/ตำแหน่งนั้นเลย** (API ตอบ 404 `not_found`) = คำนวณไม่ได้ทั้งพอร์ต
  ⇒ หน้าจอต้องขึ้น **ชื่อกลุ่มที่ขาด + วิธีเติม** (บันทึกผลที่หน้า 📝 กรอกผลส่งไลน์ ฝั่งโน้น
  ซึ่ง push ผลหวยขึ้นมาให้เอง หรือรัน `sync_to_supabase.py`) ไม่ใช่ขึ้นว่า "โหลดไม่สำเร็จ" เฉย ๆ
  · 404 แบบนี้ **ห้ามลองใหม่วนไป** — ปล่อยคีย์ค้างใน `pending` ไม่งั้นยิงซ้ำทุกครั้งที่พิมพ์แก้ขา

## หน้าเลือกสูตร (`/formulas` · ต้องมีสิทธิ์ดูหน้าหวย)

ตอบคำถามเดียว: **"ปีนี้ หวยตัวไหนใช้สูตรนี้แล้วกำไรดีสุด"** — ย้ายมาจาก
`pages/2_🧪_เลือกสูตร.py` ของ Streamlit · หน้านี้ **คำนวณเอง** (ต่างจาก `/portfolio`)

- ⚠️⚠️ **"เลือก n_bet จากปีก่อนหน้า" ต้องจัดอันดับบน train เท่านั้น** —
  `runAllSizes` รอบแรกส่ง **train เป็น test** เพื่อหาว่า n ไหนดีบนอดีต แล้วค่อยเอา n
  นั้นไปวัดผลบนปี test · ถ้าเผลอจัดอันดับบน test = โหมด "รู้ผลแล้ว" ซึ่งตัวเลขจะสวยขึ้น
  ทันทีแบบไม่มีใครสงสัย (วัดจริง: +361,500 → +448,400 ในหวยเดียวกัน)
  ⇒ `scripts/rank-check.ts` คือประตูที่กันไว้ เทียบกับเฉลยจาก Python 1,080 จุด
  (เฉลยสร้างที่ฝั่งโน้น: `python3 scripts/export_engine_fixture.py --rank-from <engine-golden.json> --out rank-golden.json`)
- แบ่งงานกัน 2 ที่ **ตั้งใจ**: ตารางอันดับคำนวณที่ server (`/api/lottery/rank` — ต้องอ่าน
  ผลหวยทุกตัว ~0.8 MB) ส่วนหน้ารายละเอียดของหวยที่กดโหลดเฉพาะกลุ่มนั้นไปคำนวณใน
  เบราว์เซอร์ (`analyzeGroup`) ⇒ กดสลับอันดับ n_bet แล้วกราฟขยับทันที
  · logic อยู่ที่ `src/lib/lottery/rank.ts` ที่เดียว ทั้งสองฝั่ง import ตัวเดียวกัน
- ⚠️⚠️ **Supabase ตัดผลลัพธ์ที่ 1,000 แถวเสมอ** (`db-max-rows` ของ PostgREST) และ
  `.limit(20000)` ไม่ช่วย — มันตัด**เงียบ ๆ** ไม่มี error · ตอนนี้ตารางมี 1,182 แถว
  ⇒ ต้องอ่านผ่าน `src/lib/lottery/dataset-read.ts` ที่ไล่ทีละหน้าด้วย `.range()`
  (ก่อนแก้: เห็น 233 กลุ่มจาก 270 · ตารางอันดับหายไป 180 แถวโดยหน้าจอไม่ฟ้องอะไรเลย)
- ⚠️⚠️ ตาราง `lottery_datasets` มี **ทั้งขา 2 ตัวและ 3 ตัว** ปนกัน (แยกด้วยคอลัมน์ `digits`)
  ⇒ หน้านี้กับ `/api/lottery/rank` ต้องขอ **`digits: 2`** เสมอ (`readAllDatasetRows({digits: 2})`
  · หน้าเว็บเรียก `/api/lottery/datasets?digits=2`) — สูตรที่นี่เป็นสูตร 2 ตัวล้วน ถ้าเผลออ่าน
  สามบนเข้ามา มันจะหั่น sequence ทีละ 2 ตัวอักษรแล้วได้ "เลข" ที่ไม่ใช่ผลหวยอะไรเลย
  **โดยไม่มี error ให้เห็น** · ส่วนหน้าพอร์ตไม่ใส่ `digits` เพราะพอร์ตมีขาสามบนได้

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
