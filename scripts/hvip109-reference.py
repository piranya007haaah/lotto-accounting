"""HVIP-109 v1.0: Python 3.9+, standard library only.

Run: python hvip109.py --month 2569-10
Data: hvip109-data.json beside this script, or --data another.json
"""
import argparse
import json
import re
from collections import Counter
from datetime import date, timedelta
from pathlib import Path

NUMBERS = [f"{i:02d}" for i in range(100)]


def month_start(text):
    """Accept YYYY-MM, either Buddhist year (>=2400) or Gregorian year."""
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", text):
        raise ValueError("Month must be YYYY-MM, e.g. 2569-10 or 2026-10")
    year, month = map(int, text.split("-"))
    if year >= 2400:
        year -= 543
    return date(year, month, 1)


def shift_month(first, offset):
    index = first.year * 12 + first.month - 1 + offset
    return date(index // 12, index % 12 + 1, 1)


def read_data(path):
    """Source dates use Gregorian YYYY-MM-DD. Numbers must be strings."""
    data = json.loads(Path(path).read_text(encoding="utf-8-sig"))
    if data.get("series") != "HVIP_UPPER2":
        raise ValueError("Expected series HVIP_UPPER2; do not mix lower-two data")

    draws = {}
    for row in data["draws"]:
        day = date.fromisoformat(row["date"])
        if day in draws:
            raise ValueError(f"Duplicate draw date: {day}")

        upper3 = row.get("upper3")
        if not isinstance(upper3, str) or not re.fullmatch(r"[0-9]{3}", upper3):
            raise ValueError(
                f"{day}: upper3 must be a three-digit string, e.g. 006"
            )
        draws[day] = upper3[-2:]

    no_draw = [date.fromisoformat(x) for x in data.get("no_draw", [])]
    if len(set(no_draw)) != len(no_draw):
        raise ValueError("Duplicate no_draw dates")
    if set(draws) & set(no_draw):
        raise ValueError("A date cannot have both a result and no_draw status")

    return draws, set(no_draw)


def select(draws, no_draw, first):
    if first.day != 1:
        raise ValueError("Target must be the first day of a month")

    start10 = shift_month(first, -10)
    start9 = shift_month(first, -9)
    start60 = first - timedelta(days=60)

    # Require every date to have a result or confirmed no-draw status.
    missing = []
    day = start10
    while day < first:
        if day not in draws and day not in no_draw:
            missing.append(day.isoformat())
        day += timedelta(days=1)

    if missing:
        raise ValueError(
            "Missing dates; add results or confirmed no_draw: "
            + ", ".join(missing)
        )

    # Exclude target-month results and all later results.
    train10 = [
        v for d, v in sorted(draws.items()) if start10 <= d < first
    ]
    train9 = [
        v for d, v in sorted(draws.items()) if start9 <= d < first
    ]
    last60 = [
        v for d, v in sorted(draws.items()) if start60 <= d < first
    ]

    if not train10 or not train9:
        raise ValueError("No numeric draws in a required training window")

    count10 = Counter(train10)
    count9 = Counter(train9)
    count60 = Counter(last60)

    # Include all 100 numbers. Break frequency ties by smaller number.
    rank10 = sorted(NUMBERS, key=lambda n: (-count10[n], int(n)))
    rank9 = sorted(NUMBERS, key=lambda n: (-count9[n], int(n)))

    top = rank10[:34]       # positions 1-34
    mid = rank9[34:67]      # positions 35-67, separate ranking
    union = set(top) | set(mid)

    # Remove four OR MORE occurrences in 60 calendar days.
    hot_removed = sorted(n for n in union if count60[n] >= 4)
    after_hot = union - set(hot_removed)

    # Digit counts use ALL draws in the 10-month TOP window.
    tens = Counter(n[0] for n in train10)
    units = Counter(n[1] for n in train10)
    scores = {
        n: (tens[n[0]] + 1) * (units[n[1]] + 1)
        for n in NUMBERS
    }

    ranked = sorted(after_hot, key=lambda n: (-scores[n], int(n)))

    # Integer division is exactly floor(K * 20%).
    remove_count = len(ranked) // 5
    keep_count = len(ranked) - remove_count
    candidates = sorted(ranked[:keep_count])
    digit_removed = sorted(ranked[keep_count:])

    return {
        "formula": "HVIP-TM109-H60-D20-v1.0",
        "target_month": first.strftime("%Y-%m"),
        "data_cutoff": (first - timedelta(days=1)).isoformat(),
        "windows": {
            "TOP10_and_digit_score": [
                str(start10), str(first - timedelta(days=1))
            ],
            "MID9": [
                str(start9), str(first - timedelta(days=1))
            ],
            "H60": [
                str(start60), str(first - timedelta(days=1))
            ],
        },
        "draw_counts": {
            "TOP10": len(train10),
            "MID9": len(train9),
            "H60": len(last60),
        },
        "TOP34": top,
        "MID33": mid,
        "union": sorted(union),
        "hot_removed": hot_removed,
        "after_hot": sorted(after_hot),
        "digit_removed": digit_removed,
        "candidate_count": len(candidates),
        "candidates": candidates,
        "audit_all_numbers": [
            {
                "number": n,
                "frequency10": count10[n],
                "frequency9": count9[n],
                "frequency60": count60[n],
                "tens_frequency": tens[n[0]],
                "units_frequency": units[n[1]],
                "digit_score": scores[n],
            }
            for n in NUMBERS
        ],
    }


def main():
    parser = argparse.ArgumentParser(
        description="HVIP-109 monthly candidates"
    )
    parser.add_argument(
        "--month", required=True, help="2569-10 or 2026-10"
    )
    parser.add_argument(
        "--data",
        type=Path,
        default=Path(__file__).with_name("hvip109-data.json"),
    )
    parser.add_argument(
        "--out", type=Path, help="Optional path for detailed JSON result"
    )
    args = parser.parse_args()

    try:
        draws, no_draw = read_data(args.data)
        result = select(draws, no_draw, month_start(args.month))

        if args.out:
            if args.out.resolve() in {
                args.data.resolve(), Path(__file__).resolve()
            }:
                raise ValueError(
                    "Output must not overwrite the data or this program"
                )
            args.out.write_text(
                json.dumps(result, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
    except (OSError, ValueError, KeyError, TypeError) as exc:
        parser.exit(1, f"ERROR: {exc}\n")

    print("Formula:", result["formula"])
    print("Month:", result["target_month"], "Cutoff:", result["data_cutoff"])
    print("Windows:", result["windows"])
    print("Draw counts:", result["draw_counts"])
    print("Union:", len(result["union"]))
    print("Hot removed:", " ".join(result["hot_removed"]) or "none")
    print("After hot:", len(result["after_hot"]))
    print("Digit removed:", " ".join(result["digit_removed"]) or "none")
    print("Candidates:", result["candidate_count"])

    for i in range(0, result["candidate_count"], 10):
        print(" ".join(result["candidates"][i:i + 10]))

    if args.out:
        print("Detailed result saved:", args.out.resolve())


if __name__ == "__main__":
    main()