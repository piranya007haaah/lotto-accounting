"use client";

/**
 * แผงแก้พอร์ต — ชื่อ/ทุน/ใช้จริง + ลิสต์ขา + ปุ่มเพิ่มขา
 *
 * แก้ที่นี่ทั้งหมดคือแก้ **สำเนาในหน้าจอ** เท่านั้น ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึกของหน้า
 * (หน้าแม่เป็นคนถือปุ่มนั้น เพราะมันคือคนที่รู้ว่า "ของบนเซิร์ฟเวอร์" หน้าตาเป็นยังไง)
 */

import { useState } from "react";
import { Alert, SectionTitle } from "@/components/ui";
import { formatBahtShort } from "@/lib/format";
import type { LotteryPortfolio, PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { AddLeg, type DatasetGroup } from "./AddLeg";
import { NumberField, TextField } from "./fields";
import { LegCard } from "./LegCard";
import { isMonthly, legCost } from "./leg-utils";

export function PortfolioEditor({
  draft,
  onChange,
  groups,
  sequences,
  onNeedSequences,
}: {
  draft: LotteryPortfolio;
  onChange: (next: LotteryPortfolio) => void;
  groups: DatasetGroup[];
  sequences: ReadonlyMap<string, string>;
  onNeedSequences: (lottery: string, position: string) => void;
}) {
  const [openLeg, setOpenLeg] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);

  const legs = draft.config.legs;
  const totalCost = legs.reduce((sum, leg) => sum + legCost(leg), 0);
  const anyMonthly = legs.some((leg) => isMonthly(leg));
  const active = Boolean(draft.config.is_active);

  const setLegs = (next: PortfolioLegConfig[]) => {
    onChange({ ...draft, config: { ...draft.config, legs: next } });
  };

  return (
    <>
      <section className="card space-y-2.5 px-3.5 py-3">
        <SectionTitle>ตั้งค่าพอร์ต</SectionTitle>

        <TextField
          label="ชื่อพอร์ต"
          value={draft.name}
          maxLength={200}
          onChange={(value) => onChange({ ...draft, name: value })}
        />

        <NumberField
          label="ทุนเริ่มต้น"
          value={draft.capital}
          min={0}
          max={1_000_000_000}
          suffix="บ."
          help="ทุนไม่มีผลกับการเลือกเลข — มีผลกับเส้นทุนและตัวเลขความเสี่ยงเท่านั้น"
          onChange={(value) => onChange({ ...draft, capital: value })}
        />

        <label className="flex items-start gap-2.5">
          <input
            type="checkbox"
            className="mt-0.5 size-[18px] flex-none"
            checked={active}
            onChange={(event) =>
              onChange({ ...draft, config: { ...draft.config, is_active: event.target.checked } })
            }
          />
          <span>
            <span className="text-[13.5px] font-semibold">ใช้จริง</span>
            <span className="dim block text-[10.5px] leading-relaxed">
              พอร์ตที่ระบบเอาไปรายงานเข้า LINE และหยิบขึ้นมาก่อนในหน้าอื่น
            </span>
          </span>
        </label>
      </section>

      <section className="card px-3.5 py-3">
        <SectionTitle
          action={
            <button type="button" className="link-sm" onClick={() => setAdding((value) => !value)}>
              {adding ? "ปิดแผงเพิ่มขา" : "➕ เพิ่มขา"}
            </button>
          }
        >
          ขาทั้งหมดในพอร์ต ({legs.length})
        </SectionTitle>

        {legs.length === 0 ? (
          <p className="py-5 text-center text-[13px]" style={{ color: "var(--dim)" }}>
            พอร์ตนี้ยังไม่มีขา — กด “➕ เพิ่มขา”
          </p>
        ) : (
          legs.map((leg, index) => (
            <LegCard
              key={`${leg.lottery}|${leg.position}|${leg.test_year}|${index}`}
              leg={leg}
              index={index}
              capital={draft.capital}
              sequences={sequences}
              open={openLeg === index}
              canEdit
              onToggle={() => setOpenLeg((current) => (current === index ? null : index))}
              onChange={(next) => setLegs(legs.map((item, i) => (i === index ? next : item)))}
              onDelete={() => {
                // ลบแล้ว index ของขาที่เหลือเลื่อน — ต้องปิดแผงด้วย ไม่งั้นจะไปเปิดค้างที่ขาอื่น
                setOpenLeg(null);
                setLegs(legs.filter((_, i) => i !== index));
              }}
            />
          ))
        )}

        <p className="dim mt-2 text-[10.5px] leading-relaxed">
          ต้นทุนรวมทุกขา <b>{formatBahtShort(totalCost)}</b> บ./งวด
          {draft.capital > 0 ? ` · ${((totalCost / draft.capital) * 100).toFixed(1)}% ของทุน` : ""}
          {totalCost > 0 && draft.capital > 0
            ? ` · ถ้าแพ้ติดกันรวดเดียวทุนหมดใน ${Math.floor(draft.capital / totalCost)} งวด`
            : ""}
        </p>
        {anyMonthly ? (
          <p className="dim mt-1 text-[10.5px] leading-relaxed">
            ℹ️ มีขาที่ตั้งเลข <b>แยกรายเดือน</b> — ต้นทุนด้านบนคิดจากเดือนที่แทงเยอะสุดของแต่ละขา
            (worst case) เดือนอื่นจะถูกกว่านี้
          </p>
        ) : null}
      </section>

      {adding ? (
        groups.length === 0 ? (
          <Alert tone="warn">ยังโหลดรายชื่อหวยไม่ได้ — เพิ่มขาใหม่ไม่ได้ตอนนี้</Alert>
        ) : (
          <AddLeg
            groups={groups}
            sequences={sequences}
            capital={draft.capital}
            onNeedSequences={onNeedSequences}
            onClose={() => setAdding(false)}
            onAdd={(leg) => {
              setLegs([...legs, leg]);
              setAdding(false);
              setOpenLeg(legs.length);
            }}
          />
        )
      ) : null}
    </>
  );
}
