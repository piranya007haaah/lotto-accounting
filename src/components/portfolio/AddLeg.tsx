"use client";

/**
 * แผง "➕ เพิ่มขา" — ย้ายมาจากการ์ดเพิ่มขาของ `pages/3_💼_Portfolio.py`
 *
 * ลำดับที่ผู้ใช้ต้องเลือก: หวย+ตำแหน่ง → ปี test → ปี train → โหมด → เงินแทง/เรตจ่าย → ชุดเลข
 * (ทั้งหมดล็อกไม่ได้หลังเพิ่มแล้ว ยกเว้นเงินแทง/เรตจ่าย/ชุดเลข — ดู LegCard.tsx)
 *
 * ⚠️ ปี train ต้องอยู่ **ก่อน** ปี test เสมอ (ไม่งั้นคือเทรนด้วยงวดที่กำลังทดสอบ = โกงตัวเอง)
 * ⇒ ตัวเลือกปี train มีให้เฉพาะปีที่น้อยกว่าปี test
 */

import { useEffect, useMemo, useState } from "react";
import { Alert, Chip } from "@/components/ui";
import { formatBahtShort } from "@/lib/format";
import { DEFAULT_FORMULA, FORMULA_NAMES } from "@/lib/lottery/formulas";
import type { PortfolioLegConfig } from "@/lib/lottery/portfolio-config";
import { NumberField } from "./fields";
import { ManualNumbers } from "./ManualNumbers";
import { digitsOfPosition, legLabel } from "./leg-utils";
import { previewRanks } from "./rank-preview";

export interface DatasetGroup {
  lottery: string;
  position: string;
  flag: string;
  years: string[];
}

interface ManualState {
  nums: string[];
  months?: Record<string, string[]>;
  nBet: number;
}

export function AddLeg({
  groups,
  sequences,
  capital,
  onNeedSequences,
  onAdd,
  onClose,
}: {
  groups: DatasetGroup[];
  sequences: ReadonlyMap<string, string>;
  capital: number;
  /** ให้หน้าแม่โหลดผลหวยของกลุ่มนี้เข้ามาใน map (ต้องมีก่อนถึงจะจัดอันดับ n_bet ได้) */
  onNeedSequences: (lottery: string, position: string) => void;
  onAdd: (leg: PortfolioLegConfig) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [groupKey, setGroupKey] = useState("");
  const [testYear, setTestYear] = useState("");
  const [trainYears, setTrainYears] = useState<string[]>([]);
  const [useFormula, setUseFormula] = useState(true);
  const [formula, setFormula] = useState(DEFAULT_FORMULA);
  const [rank, setRank] = useState(1);
  const [bet, setBet] = useState(100);
  const [payout, setPayout] = useState(100);
  const [manual, setManual] = useState<ManualState>({ nums: [], nBet: 0 });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? groups.filter((group) => `${group.lottery} ${group.position}`.toLowerCase().includes(needle))
      : groups;
    return rows.slice(0, 300);
  }, [groups, query]);

  const group = groups.find((item) => `${item.lottery}|${item.position}` === groupKey) ?? null;
  const digits = group ? digitsOfPosition(group.position) : 2;
  const years = useMemo(() => [...(group?.years ?? [])].sort(), [group]);

  // เลือกหวยแล้ว: ตั้งปี test เป็นปีล่าสุด · ปี train = ทุกปีก่อนหน้า · โหลดผลหวยมาเตรียมไว้
  useEffect(() => {
    if (!group) return;
    const latest = years[years.length - 1] ?? "";
    setTestYear(latest);
    setTrainYears(years.filter((year) => year < latest));
    setUseFormula(digitsOfPosition(group.position) === 2 && years.length > 1);
    setRank(1); // อันดับของหวยเก่าไม่มีความหมายกับหวยใหม่ (คนละตาราง n_bet กัน)
    onNeedSequences(group.lottery, group.position);
    // ตั้งใจไม่ใส่ onNeedSequences ใน deps — ต้องยิงตอนเปลี่ยน "กลุ่ม" เท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey]);

  const draft: PortfolioLegConfig | null = group
    ? {
        group_label: legLabel(group.flag || "🎰", group.lottery, group.position),
        lottery: group.lottery,
        position: group.position,
        flag: group.flag || "🎰",
        digits: digits as 2 | 3,
        train_years: useFormula ? [...trainYears].sort() : [],
        test_year: testYear,
        mode: useFormula ? (rank === 1 ? "auto" : "rank") : "manual",
        formula_name: useFormula ? formula : null,
        rank: useFormula ? rank : null,
        n_bet: useFormula ? 0 : manual.nBet,
        manual_nums: useFormula ? [] : manual.nums,
        ...(useFormula || manual.months === undefined ? {} : { manual_months: manual.months }),
        bet_per_number: bet,
        payout_rate: payout,
      }
    : null;

  const preview = useMemo(
    () => (draft && useFormula ? previewRanks({ leg: draft, formula, capital, sequences }) : null),
    // draft ถูกสร้างใหม่ทุก render — ผูก deps กับค่าที่มีผลจริงแทน
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groupKey, testYear, trainYears.join(","), useFormula, formula, bet, payout, capital, sequences],
  );

  const chosenSize = preview?.choices.find((choice) => choice.rank === rank)?.size ?? 0;
  const nBet = useFormula ? chosenSize : manual.nBet;

  const problem = !group
    ? "เลือกหวยที่จะแทงก่อน"
    : !testYear
      ? "เลือกปี test"
      : useFormula
        ? trainYears.length === 0
          ? "เลือกปี train อย่างน้อย 1 ปี"
          : preview?.error
            ? preview.error
            : chosenSize === 0
              ? "ยังคำนวณจำนวนเลขไม่ได้"
              : null
        : manual.nums.length === 0
          ? `ใส่เลข ${digits} หลักอย่างน้อย 1 ตัว`
          : null;

  return (
    <div className="card space-y-2.5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="card-title">➕ เพิ่มขา</h2>
        <button type="button" className="link-sm" onClick={onClose}>
          ปิด
        </button>
      </div>

      <label className="block">
        <span className="field-label">ค้นหาหวย</span>
        <input
          className="field"
          value={query}
          placeholder="พิมพ์ชื่อหวย เช่น ฮานอย"
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <label className="block">
        <span className="field-label">หวย · ตำแหน่ง ({filtered.length} กลุ่ม)</span>
        <select className="field" value={groupKey} onChange={(event) => setGroupKey(event.target.value)}>
          <option value="">— เลือก —</option>
          {filtered.map((item) => (
            <option key={`${item.lottery}|${item.position}`} value={`${item.lottery}|${item.position}`}>
              {item.flag} {item.lottery} · {item.position}
            </option>
          ))}
        </select>
      </label>

      {group ? (
        <>
          <div>
            <p className="field-label">ปี Test (ปีที่วัดผล)</p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {years.map((year) => (
                <Chip
                  key={year}
                  active={testYear === year}
                  onClick={() => {
                    setTestYear(year);
                    setTrainYears(years.filter((item) => item < year));
                  }}
                >
                  25{year}
                </Chip>
              ))}
            </div>
          </div>

          <div>
            <p className="field-label">โหมดเลือกเลข</p>
            <div className="flex gap-1.5">
              <Chip active={!useFormula} onClick={() => setUseFormula(false)}>
                ✍️ กำหนดเลขเอง
              </Chip>
              <Chip
                active={useFormula}
                onClick={() => {
                  if (digits === 2) setUseFormula(true);
                }}
              >
                🏆 ใช้สูตร (อันดับจากปีก่อน)
              </Chip>
            </div>
            {digits === 3 ? (
              <p className="dim mt-1 text-[10.5px]">ขา 3 หลักยังไม่มีสูตรในแอปนี้ — ต้องกำหนดเลขเอง</p>
            ) : null}
          </div>

          {useFormula ? (
            <>
              <div>
                <p className="field-label">ปี Train (ต้องอยู่ก่อนปี test)</p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {years
                    .filter((year) => year < testYear)
                    .map((year) => (
                      <Chip
                        key={year}
                        active={trainYears.includes(year)}
                        onClick={() =>
                          setTrainYears((current) =>
                            current.includes(year)
                              ? current.filter((item) => item !== year)
                              : [...current, year].sort(),
                          )
                        }
                      >
                        25{year}
                      </Chip>
                    ))}
                </div>
                {years.filter((year) => year < testYear).length === 0 ? (
                  <p className="dim mt-1 text-[10.5px]">ปีนี้เป็นปีแรกที่มีข้อมูล — ใช้สูตรไม่ได้</p>
                ) : null}
              </div>

              <div>
                <p className="field-label">สูตร</p>
                <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                  {FORMULA_NAMES.map((name) => (
                    <Chip
                      key={name}
                      active={formula === name}
                      onClick={() => {
                        setFormula(name);
                        setRank(1); // ตาราง n_bet เปลี่ยนตามสูตร — อันดับเดิมชี้ไปคนละจำนวนเลข
                      }}
                    >
                      {name}
                    </Chip>
                  ))}
                </div>
              </div>

              <div>
                <p className="field-label">อันดับ (จัดจากปี train เท่านั้น)</p>
                {preview?.error ? (
                  <p className="text-[11.5px]" style={{ color: "var(--color-money-in)" }}>
                    {preview.error}
                  </p>
                ) : (
                  <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                    {(preview?.choices ?? []).map((choice) => (
                      <Chip key={choice.rank} active={rank === choice.rank} onClick={() => setRank(choice.rank)}>
                        #{choice.rank} · {choice.size} เลข
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
            <NumberField label="เงินแทง/ตัว" value={bet} min={0} max={1_000_000} suffix="บ." onChange={setBet} />
            <NumberField label="เรตจ่าย" value={payout} min={1} max={10_000} onChange={setPayout} />
          </div>

          {!useFormula && draft ? (
            <ManualNumbers
              leg={draft}
              onChange={(next) =>
                setManual({ nums: next.manual_nums, months: next.manual_months, nBet: next.n_bet })
              }
            />
          ) : null}

          <p className="dim text-[10.5px] leading-relaxed">
            📋 จะแทง <b>{nBet}</b> เลข · ต้นทุน {formatBahtShort(nBet * bet)} บ./งวด
          </p>

          {problem ? <Alert tone="warn">{problem}</Alert> : null}

          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={Boolean(problem) || !draft}
            onClick={() => {
              if (!draft || problem) return;
              onAdd({ ...draft, n_bet: nBet });
            }}
          >
            ➕ เพิ่มขานี้
          </button>
        </>
      ) : null}
    </div>
  );
}
