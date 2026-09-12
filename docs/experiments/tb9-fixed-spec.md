# TB9-Fixed v1.0 — ท็อปบอตทอม 9 เดือน ชุดคงที่รายเดือน

เอกสารข้อกำหนดสำหรับคำนวณซ้ำและนำไปพัฒนาเว็บไซต์ วันที่จัดทำ 12 กันยายน 2569

## ขอบเขต
ใช้ผล 2 ตัวบนลาวสตาร์ เลขตรง 00–99 เท่านั้น Bottom หมายถึงกลุ่มความถี่ต่ำ ไม่ใช่รางวัล 2 ตัวล่าง สูตรนี้คงชุดตลอดเดือน ไม่ใช่สูตรปรับทุกงวด ไม่ใช้ Delta หรือค่าน้ำหนักความถี่ตามความใหม่

## ขั้นตอนที่ต้องทำตามลำดับ
1. กำหนดเดือนเป้าหมาย M ใช้วันที่ ค.ศ. ในระบบ แสดง พ.ศ. ได้ ตั้งขอบเขตตามวันที่ออกรางวัลของแหล่งข้อมูล ไม่เลื่อนวันตามเขตเวลาของเครื่องผู้ชม
2. นับความถี่จาก 9 เดือนปฏิทินเต็มก่อน M เท่านั้น ไม่ใช่ 270 งวด ทุกงวดมีน้ำหนักเท่ากัน เรียกจำนวนงวดจริงว่า N และจำนวนครั้งของเลข n ว่า c(n) ต้องรวมเลขไม่ออกไว้ด้วยความถี่ศูนย์
3. เรียงเลข 00–99 ด้วยความถี่มากก่อน หากเท่ากันเลขน้อยก่อน Top=อันดับ1–34, Mid=35–67, Bottom=68–100 ห้ามขยายกลุ่มเพราะความถี่เสมอ
4. เลือก Top ทั้ง34ตัว ไม่ตัดเลขที่ออกเดือนก่อนหน้า
5. สำหรับแต่ละเลข คำนวณ p=(c+1)/(N+100), T=ceil(ln(0.5)/ln(1−p))
6. นับ g จากประวัติทั้งหมดก่อนเดือนเป้าหมาย: จำนวนงวดที่ออกจริงหลังครั้งล่าสุดที่เลขนั้นออก ไม่รวมงวดที่เลขนั้นออก ถ้าเพิ่งออกงวดสุดท้าย g=0 ถ้าไม่เคยพบในประวัติทั้งหมด g=จำนวนงวดประวัติและต้องระบุว่าเป็นค่าต่ำสุด ไม่ใช่อายุที่ทราบแน่นอน วันงดไม่เพิ่ม g
7. เพิ่ม Bottom ทุกตัวที่ g≥T
8. ถ้ารวมยังไม่ถึง45 เพิ่มเฉพาะ Mid เรียง g/T มากก่อน แล้ว c มากก่อน แล้วเลขน้อยก่อน จนครบ45 Mid ที่เติมไม่จำเป็นต้องผ่าน g≥T ห้ามเติม Bottom ที่ไม่ผ่านเกณฑ์
9. เรียงสมาชิกเพื่อแสดงผลจากน้อยไปมาก เก็บชุดและจำนวนไว้คงที่ทั้งเดือน เลขออกแล้วไม่ตัด เลขอื่นถึงเกณฑ์ระหว่างเดือนไม่เพิ่ม คำนวณใหม่เมื่อขึ้นเดือนใหม่

กรอบจำนวนที่สูตรนี้ให้จริงคือ45–67ตัว เพราะ Top34+Bottomสูงสุด33 แม้กรอบความต้องการทั่วไปเคยตั้ง45–75 สูตรนี้ไม่สามารถให้68–75โดยไม่แก้เวอร์ชัน

## ความหมายของเกณฑ์อายุ
T เป็นเกณฑ์ทดลองที่ได้จากแบบจำลองสมมติว่าโอกาสคงที่และแต่ละงวดอิสระ ค่า0.5ไม่ได้หมายถึงความแม่นยำของชุดหรือเป้าหมายครอบคลุม50% pเป็นค่าประมาณจากความถี่ที่ปรับเรียบ ไม่ใช่โอกาสที่ได้รับการพิสูจน์แล้ว เลขหายไปนานไม่ได้แปลว่าต้องออก และ T ไม่ใช่จำนวนงวดสูงสุดที่จะหายไปได้

## ตัวอย่างกันยายน2569
ข้อมูลความถี่1ธันวาคม2568–31สิงหาคม2569 จำนวน274งวด ใช้ประวัติก่อนกันยายนทั้งหมดนับg
เลข21: c=1, p=2/374, T=130, g=138 จึงผ่านเกณฑ์Bottom
Top34 + Bottom18 + Mid0 =52ตัว

```text
01 02 04 07 08 09 10 12 13 14
15 16 17 18 21 23 24 25 28 35
36 39 40 47 48 50 51 52 54 58
61 62 65 66 70 72 74 75 79 84
85 86 87 88 89 90 92 93 95 97
98 99
```

## ต้นทุนและผลตอบแทนจำลอง
แทงเลขละ b หน่วยต่อทุกงวดจริง ชุดมี K ตัว เดือนมี D งวด ถูก H งวด:
ต้นทุน=K×D×b; เงินรับรวม=100×H×b; กำไรสุทธิ=b×(100×H−K×D)
ตีความจ่าย100เท่าเป็นเงินรับรวม100ต่อเงินแทงเลขที่ถูก1 ไม่บวกคืนอีก1 ไม่มีทบเงิน ไม่มีหยุดขาดทุน ไม่มีค่าธรรมเนียมเพิ่มเติม วันงดไม่มีต้นทุน
ตัวอย่างK52,D30: ถูก15งวดกำไร−60, ถูก16งวดกำไร+40 เมื่อb=1

## ข้อมูลและการตรวจสอบก่อนคำนวณ
วันที่ไม่ซ้ำ เลขเป็นสตริงสองหลัก เลขซ้ำข้ามวันเก็บตามจริง ถ้ามีรางวัล3หลักให้ตรวจว่าสองหลักท้ายตรงกัน แยกประเภทรางวัลชัดเจน
ตรวจทุกวันของช่วงที่ประกาศว่าประวัติครบให้เป็นผลจริงหรือรายการงดที่ยืนยัน ห้ามถือวันที่หายเป็นงดเอง ฟังก์ชันด้านล่างรับข้อมูลที่ผ่านขั้นตอนนี้แล้ว ไม่ได้ตรวจความครบปฏิทินแทนฐานข้อมูล
ชุดข้อมูลอ้างอิงเริ่ม1มกราคม2566 งด16–21และ26กุมภาพันธ์2566 และ7มกราคม2568 ตามผู้ใช้ยืนยัน มี1331งวดถึง31สิงหาคม2569 การเพิ่มประวัติเก่าหรือแก้ผลอาจเปลี่ยนgและผลคัด ต้องออกข้อมูลเวอร์ชันใหม่
ถ้าต้นเดือนงด ให้ล็อกชุดที่ขอบเดือนตามปฏิทินโดยไม่ใช้ผลใดของเดือนเป้าหมาย วันที่สร้างจริงห้ามเขียนย้อนหลังให้เหมือนสร้างก่อนทราบผล

## ข้อกำหนดเว็บไซต์
เก็บ snapshot รายเดือนที่แก้ไขทับไม่ได้ พร้อม formula_id, formula_version, target_month, training_start, training_end_exclusive, training_draws, history_start, data_version หรือ SHA256 ของข้อมูลต้นทางที่จัดรูปแบบแน่นอน, generated_at, candidates, candidate_count
เก็บ audit ครบ100เลข: ความถี่ อันดับ กลุ่ม ครั้งล่าสุด g สถานะอายุเป็นค่าต่ำสุด p T และเหตุผลคัด top_all/bottom_gap/mid_fill หรือไม่คัด
หน้ารายเดือนแสดงช่วงข้อมูล จำนวนงวด จำนวนcandidates และแยกTop/Mid/Bottom ให้ตรวจได้ เก็บผลจริงหลังงวดออกในบัญชีผล ไม่ย้อนแก้ชุดเดิม
เมื่อแก้แหล่งข้อมูลให้สร้าง snapshot revision ใหม่ เก็บตัวเก่าเพื่อเทียบ ผลจำลองกับบัญชีเงินจริงต้องแยกกัน การเปลี่ยนเดือน9เป็นอย่างอื่น สัดส่วนกลุ่ม เกณฑ์0.5 วิธีเสมอ หรือการคัดระหว่างเดือน ถือว่าเปลี่ยนสูตร ห้ามยังอ้างTB9-Fixed v1.0

## โค้ดอ้างอิง Python (standard library)
ฟังก์ชันนี้สร้างชุดเดือนเดียว หลังคืนค่าต้องนำcandidatesไปใช้คงที่ทั้งเดือน การเรียกใหม่ด้วยเดือนเป้าหมายเดิมจะกรองผลเดือนนั้นและอนาคตออกเสมอ

```python
from collections import Counter
from datetime import date
import math

def tb9_fixed(rows, target_month):
    """rows: validated complete history [{date: YYYY-MM-DD, top2: NN}].
    Canceled dates must be verified separately; omit them from rows.
    target_month uses CE YYYY-MM. Future rows are ignored.
    """
    start = date.fromisoformat(target_month + "-01")
    serial = start.year * 12 + start.month - 1 - 9
    train_start = date(serial // 12, serial % 12 + 1, 1)
    history = sorted((r for r in rows if date.fromisoformat(r["date"]) < start),
                     key=lambda r: r["date"])
    if not history or date.fromisoformat(history[0]["date"]) > train_start:
        raise ValueError("Insufficient history for nine calendar months")
    if len({r["date"] for r in history}) != len(history):
        raise ValueError("Duplicate draw date")
    if any(len(r["top2"]) != 2 or not r["top2"].isascii()
           or not r["top2"].isdigit() for r in history):
        raise ValueError("top2 must be a two-digit string")
    train = [r for r in history if date.fromisoformat(r["date"]) >= train_start]
    count = Counter(r["top2"] for r in train)
    numbers = [f"{i:02d}" for i in range(100)]
    ranked = sorted(numbers, key=lambda n: (-count[n], int(n)))
    last = {r["top2"]: (i, r["date"]) for i, r in enumerate(history)}
    audit = {}
    for rank, n in enumerate(ranked, 1):
        p = (count[n] + 1) / (len(train) + 100)
        threshold = math.ceil(math.log(0.5) / math.log(1 - p))
        gap = len(history) - 1 - last[n][0] if n in last else len(history)
        group = "top" if rank <= 34 else "mid" if rank <= 67 else "bottom"
        audit[n] = dict(count=count[n], rank=rank, group=group, p=p,
                        threshold=threshold, gap=gap,
                        last_date=last[n][1] if n in last else None,
                        gap_is_lower_bound=n not in last, reason=None)
    selected = ranked[:34] + [n for n in ranked[67:]
                            if audit[n]["gap"] >= audit[n]["threshold"]]
    for n in selected:
        audit[n]["reason"] = "top_all" if audit[n]["group"] == "top" else "bottom_gap"
    fillers = sorted(ranked[34:67], key=lambda n:
                     (-audit[n]["gap"] / audit[n]["threshold"], -count[n], int(n)))
    for n in fillers[:max(0, 45-len(selected))]:
        selected.append(n)
        audit[n]["reason"] = "mid_fill"
    assert 45 <= len(selected) <= 67 and len(set(selected)) == len(selected)
    return dict(formula_id="TB9-Fixed", formula_version="1.0",
                target_month=target_month, training_start=train_start.isoformat(),
                training_end_exclusive=start.isoformat(), training_draws=len(train),
                history_start=history[0]["date"], candidates=sorted(selected),
                candidate_count=len(selected), audit=audit)
```

## ผลตรวจความตรงกับงานเดิม
โค้ดนี้ให้ชุดตรงกับชุดคงที่รายเดือนเดิมครบ32เดือน มกราคม2567–สิงหาคม2569 และกันยายน2569ได้52ตัว ตรวจเพิ่มผลวันที่1กันยายนเข้าอินพุตแล้วชุดกันยายนไม่เปลี่ยน
ผลคงที่เดิม973งวด: ถูก548 ต้นทุน51,998 รับ54,800 กำไรจำลอง2,802หน่วย ROI5.3887% เมื่อแทงเลขละ1
การคัดแต่ละเดือนใช้เฉพาะอดีต แต่การเลือกสูตรจากหลายสูตรที่ลองกับข้อมูลชุดนี้แล้ว ยังมีความเสี่ยงเลือกสูตรเข้ากับอดีต ผลนี้ไม่ใช่การทดสอบอิสระและไม่ใช่หลักฐานกำไรเงินจริง ควรล็อกเวอร์ชันและวัดข้อมูลใหม่โดยไม่แก้ย้อนหลัง