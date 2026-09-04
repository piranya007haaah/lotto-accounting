"use client";

/**
 * แผงเพิ่มขาเข้าพอร์ต — เลือก **หวย · ตำแหน่ง · ปีที่ทดสอบ** จากผลหวยที่มีอยู่จริง
 *
 * ทำไมเลือกจากรายการ ไม่ใช่พิมพ์เอง: ชื่อหวย/ตำแหน่งต้องตรงกับตาราง `lottery_datasets`
 * **เป๊ะทุกตัวอักษร** ไม่งั้นขานั้นจะหาผลหวยไม่เจอแล้วทั้งพอร์ตคำนวณไม่ออก
 * (พิมพ์ "หวยฮานอย VIP " เกินมาหนึ่งเคาะก็จบแล้ว)
 *
 * ⚠️ จำนวนหลักมาจากคอลัมน์ `digits` ของตาราง **ไม่ใช่เดาจากชื่อตำแหน่ง** — เลขที่แทง
 * และเรตจ่ายของขา 3 ตัวคนละเรื่องกับ 2 ตัว
 */

import { useMemo, useState } from "react";
import { Chip, Spinner } from "@/components/ui";
import type { DatasetGroup } from "./leg-utils";

/** โชว์ทีละเท่านี้ — มี ~270 กลุ่ม ปล่อยยาวทั้งหมดแล้วเลื่อนหาไม่เจอ */
const MAX_SHOWN = 24;

export function LegPicker({
  groups,
  loading,
  error,
  onAdd,
  onCancel,
}: {
  groups: DatasetGroup[];
  loading: boolean;
  error: string | null;
  onAdd: (group: DatasetGroup, testYear: string) => void;
  onCancel: () => void;
}) {
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<DatasetGroup | null>(null);

  const matches = useMemo(() => {
    const words = search.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return groups.slice(0, MAX_SHOWN);
    const hit = groups.filter((group) => {
      const haystack = `${group.lottery} ${group.position}`;
      return words.every((word) => haystack.includes(word));
    });
    return hit.slice(0, MAX_SHOWN);
  }, [groups, search]);

  if (picked) {
    // ปีเรียงจากน้อยไปมาก → ตัวท้าย = ปีล่าสุด = ค่าที่คนเลือกเกือบทุกครั้ง
    const years = [...picked.years].reverse();
    return (
      <section className="card space-y-2.5 px-3.5 py-3">
        <p className="text-[13px] font-semibold">
          {picked.flag} {picked.lottery} · {picked.position}
        </p>
        <p className="dim text-[10.5px]">เลือกปีที่จะวัดผล (ปีที่แทงจริง) · {picked.digits} หลัก</p>
        <div className="flex flex-wrap gap-1.5">
          {years.map((year) => (
            <Chip key={year} active={false} onClick={() => onAdd(picked, year)}>
              25{year}
            </Chip>
          ))}
        </div>
        <button type="button" className="btn btn-ghost py-2 text-[12.5px]" onClick={() => setPicked(null)}>
          ← เลือกหวยอื่น
        </button>
      </section>
    );
  }

  return (
    <section className="card space-y-2.5 px-3.5 py-3">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-[13px] font-semibold">เพิ่มขา — เลือกหวย</span>
        <button type="button" className="btn btn-ghost flex-none py-1.5 text-[12px]" onClick={onCancel}>
          ปิด
        </button>
      </div>

      <input
        className="field"
        value={search}
        placeholder="พิมพ์ชื่อหวย เช่น ฮานอย VIP สามบน"
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? <Spinner label="กำลังโหลดรายชื่อหวย..." /> : null}
      {error ? <p className="text-[12px]" style={{ color: "var(--color-money-in)" }}>{error}</p> : null}

      {!loading && !error && matches.length === 0 ? (
        <p className="dim text-[12px]">ไม่เจอหวยที่ตรงกับที่พิมพ์</p>
      ) : null}

      <div className="space-y-1">
        {matches.map((group) => (
          <button
            key={`${group.lottery}|${group.position}`}
            type="button"
            className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left"
            style={{ background: "var(--accent-tint)" }}
            onClick={() => setPicked(group)}
          >
            <span className="flex-1 truncate text-[12.5px] font-semibold">
              {group.flag} {group.lottery} · {group.position}
            </span>
            <span className="dim flex-none text-[10.5px]">
              {group.digits} หลัก · {group.years.length} ปี
            </span>
          </button>
        ))}
      </div>

      {!loading && groups.length > matches.length ? (
        <p className="dim text-[10.5px]">
          โชว์ {matches.length} จาก {groups.length} กลุ่ม — พิมพ์ชื่อเพื่อกรองให้แคบลง
        </p>
      ) : null}
    </section>
  );
}
