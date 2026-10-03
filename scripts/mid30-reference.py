# Frozen supplied Python reference; CLI was truncated in the attachment.
import argparse
import json
import re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path


# ชื่อสูตร: (ชื่อภาษาไทย, ชื่อเดิม, เดือนความถี่คู่, เดือนหลักสิบหน่วย)
FORMULAS = {
    "phupha76": (
        "ลาวภูผา76",
        "MIX7/6-MID30",
        7,
        6,
    ),
    "saithan65": (
        "ลาวสายธาร65",
        "MIX6/5-MID30",
        6,
        5,
    ),
}


def target_month(text):
    """
    รับเดือนเป้าหมายรูปแบบ YYYY-MM
    ใช้ได้ทั้ง พ.ศ. และ ค.ศ.
    เช่น 2569-10 หรือ 2026-10
    """
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", text):
        raise ValueError(
            "ระบุเดือนเป็น YYYY-MM เช่น 2569-10 หรือ 2026-10"
        )

    year, month = map(int, text.split("-"))

    if year >= 2400:
        year -= 543

    return date(year, month, 1)


def shift_month(first, offset):
    """เลื่อนเดือน โดยคืนวันที่ 1 ของเดือนนั้น"""
    index = first.year * 12 + first.month - 1 + offset

    return date(
        index // 12,
        index % 12 + 1,
        1,
    )


def load_data(path):
    """
    อ่านไฟล์ข้อมูลลาวพัฒนา

    วันที่ในไฟล์ต้องใช้ ค.ศ. เช่น 2026-09-30
    upper3 ต้องเป็นข้อความสามหลัก เช่น "006"

    coverage_from และ coverage_through:
        ช่วงวันที่ที่ผู้จัดข้อมูลยืนยันว่าข้อมูลครบ

    omitted_dates_are_no_draw:
        ต้องเป็น true เพื่อยืนยันว่าวันที่ข้ามในช่วงดังกล่าว
        เป็นวันงดออกผล ไม่ใช่ข้อมูลตกหล่น
    """
    data = json.loads(
        Path(path).read_text(encoding="utf-8-sig")
    )

    if data.get("series") != "LAO_DEVELOPMENT_UPPER2":
        raise ValueError(
            "ไฟล์นี้ไม่ใช่ข้อมูลลาวพัฒนา 2 ตัวบน"
        )

    if data.get("omitted_dates_are_no_draw") is not True:
        raise ValueError(
            "ต้องยืนยันว่าวันที่ข้ามภายในช่วงข้อมูลเป็นวันงดออกผล"
        )

    coverage_from = date.fromisoformat(
        data["coverage_from"]
    )
    coverage_through = date.fromisoformat(
        data["coverage_through"]
    )

    if coverage_from > coverage_through:
        raise ValueError("ช่วงวันที่รับรองข้อมูลไม่ถูกต้อง")

    draws = {}

    for row in data["draws"]:
        day = date.fromisoformat(row["date"])
        upper3 = row["upper3"]

        if day in draws:
            raise ValueError(
                f"พบวันที่ซ้ำ: {day}"
            )

        if not coverage_from <= day <= coverage_through:
            raise ValueError(
                f"ผลวันที่ {day} อยู่นอกช่วงข้อมูลที่รับรอง"
            )

        if (
            not isinstance(upper3, str)
            or not re.fullmatch(r"[0-9]{3}", upper3)
        ):
            raise ValueError(
                f"วันที่ {day}: upper3 ต้องเป็นข้อความสามหลัก "
                'เช่น "006"'
            )

        # แปลงสามตัวบนเป็นสองตัวบน
        # เช่น 846 -> 46, 609 -> 09, 006 -> 06
        draws[day] = upper3[-2:]

    return draws, coverage_from, coverage_through


def select_candidates(
    draws,
    coverage_from,
    coverage_through,
    first,
    formula,
):
    """
    คัด candidates ด้วยกฎ:

    1. คะแนนความถี่คู่:
       P = (c + 1) / (Nf + 100)

    2. คะแนนหลักสิบหน่วย:
       D = (t + 1) * (u + 1) / (Nd + 10)^2

    3. คะแนนรวม:
       S = 0.5 * P + 0.5 * D

    4. เรียงคะแนนมากไปน้อย
       คะแนนเท่ากันให้เลขน้อยก่อน

    5. เลือกอันดับ 31-60 จำนวน 30 ตัว

    ใช้เฉพาะผลก่อนเดือนเป้าหมาย
    """
    if first.day != 1:
        raise ValueError(
            "วันเริ่มเดือนเป้าหมายต้องเป็นวันที่ 1"
        )

    name, original, frequency_months, digit_months = (
        FORMULAS[formula]
    )

    frequency_start = shift_month(
        first,
        -frequency_months,
    )
    digit_start = shift_month(
        first,
        -digit_months,
    )
    cutoff = first - timedelta(days=1)

    # ตรวจว่าช่วงข้อมูลที่รับรองครอบคลุมกรอบย้อนหลังทั้งหมด
    if (
        coverage_from > min(frequency_start, digit_start)
        or coverage_through < cutoff
    ):
        raise ValueError(
            "ข้อมูลที่รับรองยังไม่ครอบคลุมกรอบย้อนหลังทั้งหมด "
            f"ต้องมีข้อมูลตั้งแต่ "
            f"{min(frequency_start, digit_start)} "
            f"ถึง {cutoff}"
        )

    # ไม่ใช้ผลในเดือนเป้าหมายหรือหลังจากนั้น
    pair_values = [
        value
        for day, value in draws.items()
        if frequency_start <= day < first
    ]

    digit_values = [
        value
        for day, value in draws.items()
        if digit_start <= day < first
    ]

    nf = len(pair_values)
    nd = len(digit_values)

    if nf == 0 or nd == 0:
        raise ValueError(
            "ไม่มีผลตัวเลขในกรอบย้อนหลังที่ต้องใช้"
        )

    # จำนวนครั้งของเลขสองตัว
    pair_counts = Counter(pair_values)

    # จำนวนครั้งของหลักสิบและหลักหน่วย
    tens_counts = Counter(
        number[0] for number in digit_values
    )
    units_counts = Counter(
        number[1] for number in digit_values
    )

    # ต้องจัดอันดับเลขครบ 00-99 รวมเลขที่ไม่เคยออก
    numbers = [
        f"{i:02d}" for i in range(100)
    ]

    # สูตรคะแนนจริง:
    #
    # S = 0.5 * (c+1)/(nf+100)
    #     + 0.5 * (t+1)*(u+1)/(nd+10)^2
    #
    # รวมเป็นเศษส่วนที่มีตัวหารเดียวกัน:
    #
    # ตัวเศษ =
    #     (c+1)*(nd+10)^2
    #     + (t+1)*(u+1)*(nf+100)
    #
    # ตัวหาร =
    #     2*(nf+100)*(nd+10)^2
    #
    # เรียงด้วยตัวเศษจำนวนเต็มให้ผลเหมือนเรียงคะแนนจริง
    # และหลีกเลี่ยงความคลาดเคลื่อนจากการปัดทศนิยม

    numerators = {}

    for number in numbers:
        c = pair_counts[number]
        t = tens_counts[number[0]]
        u = units_counts[number[1]]

        numerators[number] = (
            (c + 1) * (nd + 10) ** 2
            + (t + 1) * (u + 1) * (nf + 100)
        )

    denominator = (
        2 * (nf + 100) * (nd + 10) ** 2
    )

    ranked = sorted(
        numbers,
        key=lambda number: (
            -numerators[number],
            int(number),
        ),
    )

    # Python เริ่มตำแหน่งที่ 0
    # [30:60] จึงเป็นอันดับ 31-60 รวม 30 ตัว
    selected_in_rank_order = ranked[30:60]

    # เรียงเลขน้อยไปมากเพื่อแสดงผล
    # ไม่เปลี่ยนสมาชิกที่คัดได้
    candidates = sorted(selected_in_rank_order)

    all_ranks = []

    for position, number in enumerate(ranked, start=1):
        all_ranks.append(
            {
                "rank": position,
                "number": number,
                "pair_count": pair_counts[number],
                "tens_count": tens_counts[number[0]],
                "units_count": units_counts[number[1]],
                "score_numerator": numerators[number],
                "score_denominator": denominator,
                "score": (
                    numerators[number] / denominator
                ),
                "selected": 31 <= position <= 60,
            }
        )

    return {
        "name": name,
        "formula": original,
        "version": "1.0",
        "target_month": first.strftime("%Y-%m"),
        "cutoff": str(cutoff),
        "frequency_window": [
            str(frequency_start),
            str(cutoff),
        ],
        "digit_window": [
            str(digit_start),
            str(cutoff),
        ],
        "frequency_draws": nf,
        "digit_draws": nd,
        "frequency_weight": 0.5,
        "digit_weight": 0.5,
        "selected_ranks": [31, 60],
        "candidate_count": len(candidates),
        "candidates": candidates,
        "candidates_in_rank_order": selected_in_rank_order,
        "all_ranks": all_ranks,
    }
