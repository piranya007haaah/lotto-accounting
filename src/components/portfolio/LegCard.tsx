"use client";

/**
 * 1 ขาในพอร์ต — แถวสรุป + แผงแก้ไขที่กางออกมาใต้แถวนั้น
 * (ยกโครงมาจาก `_render_leg_editor` ของ `pages/3_💼_Portfolio.py`)
 *
 * ⚠️⚠️ **เปลี่ยนหวย / ตำแหน่ง / ปี train-test ของขาเดิมไม่ได้** — เปลี่ยนแล้วมันคือคนละขากัน
 * (เลขที่แทง ต้นทุน ผลย้อนหลัง คนละชุดทั้งหมด) ⇒ ต้องลบแล้วเพิ่มใหม่ · เขียนบอกบนจอด้วย
 * ไม่ใช่แค่ disable ช่องไว้เฉย ๆ แล้วให้เดาเอาเองว่าทำไมกดไม่ได้
 *
 * ⚠️ แก้ที่นี่ = แก้ "สำเนาที่กำลังแก้" เท่านั้น ยังไม่บันทึกจนกว่าจะกดปุ่มบันทึกของทั้งหน้า
 */

import { useMemo } from "react";
import { Chip } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { FORMULA_NAMES } from "@/lib/lottery/formulas";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { ConfirmButton, NumberField } from "./fields";
import { ManualNumbers } from "./ManualNumbers";
import { bettingMonths, isMonthly, legCost, legDigits, legModeText, monthName } from "./leg-utils";
import { previewRanks } from "./rank-preview";

/**
 * โชว์อันดับกี่อันดับ — ปกติ 10 (เท่าฝั่ง Streamlit) แต่ถ้าพอร์ตเก่าเก็บอันดับไว้ลึกกว่านั้น
 * ต้องโชว์ให้ถึง ไม่งั้นจะไม่มีชิปไหนติดสีเลย แล้วคนอ่านนึกว่าค่าที่ตั้งไว้หายไป
 */
function rankDepth(rank: number | null | undefined): number {
  return Math.min(30, Math.max(10, rank ?? 1));
}

function trainLabel(leg: PortfolioLegConfig): string {
  const years = [...(leg.train_years ?? [])].sort();
  if (years.length === 0) return "ไม่ใช้ปี train (กำหนดเลขเอง)";
  return `train 25${years.join(", 25")} → test 25${leg.test_year}`;
}

export function LegCard({
  leg,
  index,
  capital,
  sequences,
  open,
  canEdit,
  onToggle,
  onChange,
  onDelete,
}: {
  leg: PortfolioLegConfig;
  index: number;
  capital: number;
  sequences: ReadonlyMap<string, string>;
  open: boolean;
  canEdit: boolean;
  onToggle: () => void;
  onChange: (next: PortfolioLegConfig) => void;
  onDelete: () => void;
}) {
  const digits = legDigits(leg);
  const usesFormula = leg.mode !== "manual";
  const formula = leg.formula_name ?? FORMULA_NAMES[0];

  // อันดับ n_bet ที่เลือกได้ — คำนวณจาก **ปี train เท่านั้น** (ดู rank-preview.ts)
  const preview = useMemo(
    () => (usesFormula ? previewRanks({ leg, formula, capital, sequences, topN: rankDepth(leg.rank) }) : { choices: [], error: null }),
    [usesFormula, leg, formula, capital, sequences],
  );

  /** เปลี่ยนสูตร/อันดับ = n_bet เปลี่ยนตาม — คำนวณไม่ได้ก็ **คงค่าเดิม** ไม่เดาใหม่ */
  const applyFormulaChoice = (nextFormula: string, nextRank: number, nextMode: PortfolioLegConfig["mode"]) => {
    const next: PortfolioLegConfig = {
      ...leg,
      mode: nextMode,
      formula_name: nextFormula,
      rank: nextMode === "auto" ? 1 : nextRank,
    };
    if (nextMode === "fixed_n") {
      onChange(next);
      return;
    }
    const fresh = previewRanks({
      leg: next,
      formula: nextFormula,
      capital,
      sequences,
      topN: rankDepth(next.rank),
    });
    const size = fresh.choices.find((choice) => choice.rank === next.rank)?.size;
    onChange(size ? { ...next, n_bet: size } : next);
  };

  const months = bettingMonths(leg);
  const activeRank = leg.mode === "auto" ? 1 : (leg.rank ?? 1);
  const activeChoice = preview.choices.find((choice) => choice.rank === activeRank);
  /** ค่าที่บันทึกไว้ไม่ตรงกับที่อันดับนี้คิดได้ตอนนี้ (ผลหวยเพิ่มขึ้นตั้งแต่วันที่ตั้งพอร์ต) */
  const staleSize = activeChoice && activeChoice.size !== leg.n_bet ? activeChoice.size : null;

  return (
    <div className="row py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold">
            <span className="dim tnum mr-1.5">#{index + 1}</span>
            {leg.group_label || `${leg.flag} ${leg.lottery} · ${leg.position}`}
          </p>
          <p className="dim mt-0.5 text-[10.5px] leading-relaxed">
            {trainLabel(leg)}
            {digits === 3 ? " · เลข 3 หลัก" : ""}
            <br />
            {legModeText(leg)} · แทงตัวละ {formatBahtShort(leg.bet_per_number)} บ. · เรต {leg.payout_rate}
          </p>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className="tnum text-[12px] font-bold">{formatBahtShort(legCost(leg))} บ./งวด</span>
          <span className="dim tnum text-[10.5px]">n = {leg.n_bet}</span>
          {canEdit ? (
            <button type="button" className="link-sm mt-0.5" onClick={onToggle}>
              {open ? "ปิด" : "✏️ แก้ไข"}
            </button>
          ) : null}
        </div>
      </div>

      {open && canEdit ? (
        <div className="mt-2.5 space-y-2.5 rounded-2xl px-2.5 py-2.5" style={{ background: "var(--field-bg)" }}>
          <p className="dim text-[10.5px] leading-relaxed">
            แก้ <b>หวย / ตำแหน่ง / ปี train-test</b> ที่นี่ไม่ได้ — เปลี่ยนแล้วมันคือคนละขากันแล้ว
            ถ้าอยากเปลี่ยนให้ <b>ลบขานี้แล้วเพิ่มใหม่</b>
          </p>

          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label="เงินแทง/ตัว"
              value={leg.bet_per_number}
              min={0}
              max={1_000_000}
              suffix="บ."
              onChange={(value) => onChange({ ...leg, bet_per_number: value })}
            />
            <NumberField
              label="เรตจ่าย"
              value={leg.payout_rate}
              min={1}
              max={10_000}
              onChange={(value) => onChange({ ...leg, payout_rate: value })}
            />
          </div>

          {leg.mode === "manual" ? (
            <ManualNumbers leg={leg} onChange={onChange} />
          ) : (
            <>
              <div>
                <p className="field-label">เลือกจำนวนเลขยังไง</p>
                <div className="flex flex-wrap gap-1.5">
                  <Chip
                    active={leg.mode === "auto"}
                    onClick={() => applyFormulaChoice(formula, 1, "auto")}
                  >
                    🎯 จุดดีสุดของ train
                  </Chip>
                  <Chip
                    active={leg.mode === "rank"}
                    onClick={() => applyFormulaChoice(formula, leg.rank ?? 1, "rank")}
                  >
                    🔝 เลือกอันดับเอง
                  </Chip>
                  <Chip
                    active={leg.mode === "fixed_n"}
                    onClick={() => applyFormulaChoice(formula, leg.rank ?? 1, "fixed_n")}
                  >
                    🔢 ล็อกจำนวนเอง
                  </Chip>
                </div>
              </div>

              <div>
                <p className="field-label">สูตร</p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {FORMULA_NAMES.map((name) => (
                    <Chip
                      key={name}
                      active={formula === name}
                      onClick={() => applyFormulaChoice(name, leg.rank ?? 1, leg.mode)}
                    >
                      {name}
                    </Chip>
                  ))}
                </div>
              </div>

              {leg.mode === "fixed_n" ? (
                <NumberField
                  label="จำนวนเลขที่แทง (n_bet)"
                  value={leg.n_bet}
                  min={1}
                  max={1000}
                  suffix="ตัว"
                  onChange={(value) => onChange({ ...leg, n_bet: value })}
                />
              ) : (
                <div>
                  <p className="field-label">อันดับ (จัดจากปี train เท่านั้น)</p>
                  {preview.error ? (
                    <p className="text-[11.5px] leading-relaxed" style={{ color: "var(--color-money-in)" }}>
                      ดูอันดับใหม่ไม่ได้: {preview.error}
                      <br />
                      <span className="dim">คง n_bet เดิมไว้ที่ {leg.n_bet} ตัว (ไม่เดาค่าใหม่ให้)</span>
                    </p>
                  ) : (
                    <>
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {preview.choices.map((choice) => (
                          <Chip
                            key={choice.rank}
                            active={activeRank === choice.rank}
                            onClick={() =>
                              applyFormulaChoice(formula, choice.rank, choice.rank === 1 ? leg.mode : "rank")
                            }
                          >
                            #{choice.rank} · {choice.size} เลข
                          </Chip>
                        ))}
                      </div>
                      <p className="dim mt-1 text-[10.5px] leading-relaxed">
                        ขานี้แทง <b>{leg.n_bet}</b> ตัว · ต้นทุน {formatBahtShort(legCost(leg))} บ./งวด
                        {activeChoice ? ` · อันดับนี้ทำได้ ${formatSigned(activeChoice.testProfit)} บ. บนปี test` : ""}
                      </p>
                      {staleSize !== null ? (
                        <p className="mt-1 text-[10.5px] leading-relaxed" style={{ color: "var(--color-money-in)" }}>
                          ⚠️ ตอนนี้อันดับ #{activeRank} คิดได้ <b>{staleSize}</b> ตัว ไม่ตรงกับที่บันทึกไว้ (
                          {leg.n_bet} ตัว) — ผลหวยเพิ่มขึ้นตั้งแต่วันที่ตั้งพอร์ต · กดชิปอันดับซ้ำถ้าจะใช้ค่าใหม่
                        </p>
                      ) : null}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* โหมดสูตรบอกต้นทุนไปแล้วในบรรทัดอันดับ — ไม่ต้องพูดซ้ำ */}
          {leg.mode === "manual" ? (
            <p className="dim text-[10.5px] leading-relaxed">
              ต้นทุน/งวดของขานี้ {formatBahtShort(legCost(leg))} บ.
              {isMonthly(leg)
                ? ` — คิดจากเดือนที่แทงเยอะสุด (worst case) · แทง ${months.length} เดือน: ${months
                    .map((month) => monthName(month))
                    .join(" ")}`
                : ""}
            </p>
          ) : null}

          <div className="flex justify-end">
            <ConfirmButton label="🗑️ ลบขานี้" confirmLabel="❌ ยืนยันลบ" onConfirm={onDelete} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
