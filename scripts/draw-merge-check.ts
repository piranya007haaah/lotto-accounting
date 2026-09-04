/**
 * ตรวจกติกา "เติมเฉพาะช่องว่าง" ของการกรอกผลรายวัน (`sequence-merge.ts`)
 *
 *   npx tsx scripts/draw-merge-check.ts
 *
 * ทำไมต้องมี: ตาราง `lottery_datasets` มีคนเขียน **2 ทาง** — หน้ากรอกผลของแอปนี้
 * กับ `sync_to_supabase.py` ฝั่ง Streamlit ที่ส่ง sequence เต็มปีมา upsert
 * ถ้าทางไหนทับได้โดยไม่ตั้งใจ ผลที่อีกทางเพิ่งกรอกจะหายแบบไม่มี error ให้เห็น
 *
 * ไม่ต่อเน็ต ไม่แตะ DB — เป็น logic ล้วน
 */
import { cellAt, dayIndexOf, isBlank, mergeCell, mergeSequences } from "../src/lib/lottery/sequence-merge";

let checks = 0;
const failures: string[] = [];
function expect(where: string, actual: unknown, wanted: unknown): void {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    failures.push(`${where}: ได้ ${JSON.stringify(actual)} · ควรได้ ${JSON.stringify(wanted)}`);
  }
}

/* ── index ของช่อง = วันปฏิทินจาก 1 ม.ค. (วันหยุดก็กินหนึ่งช่อง) ── */
expect("1 ม.ค. = ช่องที่ 0", dayIndexOf(new Date(Date.UTC(2026, 0, 1)), 2026), 0);
expect("2 ม.ค. = ช่องที่ 1", dayIndexOf(new Date(Date.UTC(2026, 0, 2)), 2026), 1);
expect("1 มี.ค. ปีอธิกสุรทิน", dayIndexOf(new Date(Date.UTC(2024, 2, 1)), 2024), 60);
expect("1 มี.ค. ปีปกติ", dayIndexOf(new Date(Date.UTC(2026, 2, 1)), 2026), 59);
expect("31 ธ.ค.", dayIndexOf(new Date(Date.UTC(2026, 11, 31)), 2026), 364);

/* ── เขียนช่องว่าง ── */
const seq = "1234------5678";           // 7 ช่อง: 12 34 -- -- -- 56 78
expect("อ่านช่องที่ 0", cellAt(seq, 0, 2), "12");
expect("ช่องขีดคือว่าง", isBlank(cellAt(seq, 2, 2), 2), true);
expect("ช่องมีเลขไม่ว่าง", isBlank(cellAt(seq, 1, 2), 2), false);

const filled = mergeCell(seq, 2, "99", 2);
expect("เติมช่องว่างได้", filled.sequence, "123499----5678");
expect("ความยาวไม่เปลี่ยน", filled.sequence.length, seq.length);
expect("รายงานว่าเขียนจริง", filled.changed, true);

/* ── ⚠️⚠️ ห้ามทับ ── */
const clash = mergeCell(seq, 0, "99", 2);
expect("ค่าเดิมไม่ตรง = conflict", clash.conflict, { index: 0, existing: "12", incoming: "99" });
expect("conflict แล้วต้องไม่เขียน", clash.sequence, seq);
expect("conflict แล้ว changed = false", clash.changed, false);

const same = mergeCell(seq, 0, "12", 2);
expect("กรอกซ้ำค่าเดิม = ไม่ใช่ error", same.conflict, null);
expect("กรอกซ้ำค่าเดิม = ไม่ต้องเขียน", same.changed, false);
expect("กรอกซ้ำค่าเดิม = บอกว่าเหมือนเดิม", same.alreadySame, true);

const forced = mergeCell(seq, 0, "99", 2, true);
expect("สั่งทับเองได้ (แก้ผลที่กรอกผิด)", forced.sequence, "9934------5678");
expect("สั่งทับแล้วไม่เป็น conflict", forced.conflict, null);

/* ── วันหยุด `xx` ถือว่ามีค่าแล้ว ไม่ใช่ช่องว่าง ── */
const holiday = mergeCell("xx--", 0, "45", 2);
expect("xx = มีค่าแล้ว ห้ามทับ", holiday.conflict?.existing, "xx");

/* ── ต่อความยาวเมื่อกรอกวันที่เลยปลาย sequence ── */
const grown = mergeCell("1234", 5, "77", 2);
expect("เติมช่องว่างจนถึงวันที่กรอก", grown.sequence, "1234------77");
expect("ช่องที่ 4 ยังว่างอยู่", isBlank(cellAt(grown.sequence, 4, 2), 2), true);

/* ── 3 หลัก ── */
const three = mergeCell("123---", 1, "456", 3);
expect("สามบนเขียนทีละ 3 ตัวอักษร", three.sequence, "123456");

let threw = false;
try {
  mergeCell("------", 0, "4", 2);
} catch {
  threw = true;
}
expect("เลขไม่ครบหลัก = โยน error", threw, true);

/* ── รวม sequence ทั้งปีจากสคริปต์ sync — ช่องต่อช่อง ไม่ทับทั้งก้อน ── */
// สถานการณ์จริง: เว็บกรอกงวดล่าสุดไปแล้ว (ช่องที่ 3) แต่ฝั่ง Python ยังไม่ได้ scrape
const mine = "12----56";      // เว็บมีช่อง 0 กับ 3
const theirs = "1234----";    // Python มีช่อง 0 กับ 1
const merged = mergeSequences(mine, theirs, 2);
expect("เติมช่องที่ฝั่งโน้นมีแต่เราไม่มี", merged.sequence, "1234--56");
expect("นับจำนวนช่องที่เติม", merged.filled, 1);
expect("⚠️ ช่องที่เว็บกรอกไว้ต้องไม่หาย", cellAt(merged.sequence, 3, 2), "56");
expect("ไม่มีขัดแย้ง", merged.conflicts, 0);

const clashY = mergeSequences("99", "11", 2);
expect("ทั้งสองฝั่งมีค่าและต่างกัน = นับเป็นขัดแย้ง", clashY.conflicts, 1);
expect("ขัดแย้งแล้วเก็บของเดิมไว้", clashY.sequence, "99");

if (failures.length > 0) {
  console.error(`❌ กติกาการกรอกผลผิด ${failures.length} จุด (จากทั้งหมด ${checks} จุด)`);
  for (const line of failures) console.error(`   · ${line}`);
  process.exit(1);
}
console.log(`✅ กติกา "เติมเฉพาะช่องว่าง" ถูกต้องทั้งหมด — ตรวจไป ${checks} จุด`);
