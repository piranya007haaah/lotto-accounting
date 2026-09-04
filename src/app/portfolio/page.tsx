"use client";

/**
 * พอร์ตหวย — เลือกพอร์ต · แก้ตั้งค่า/ขา · ดูผลย้อนหลัง
 *
 * ของ 2 ก้อนที่ห้ามสับสนกัน (คนละที่มา คนละความหมาย):
 *
 *   `lottery_portfolios`  (`/api/lottery/portfolios`) = **ตัวตั้งค่าพอร์ต** — แก้ที่นี่ได้
 *   `portfolio_snapshots` (`/api/portfolio/snapshot`) = **ผลที่ Python คำนวณไว้** — อ่านอย่างเดียว
 *
 * ตัวเลขที่โชว์มาได้ 2 ทาง แล้วต้องบอกบนจอเสมอว่ามาจากทางไหน:
 *   1. `computeSnapshot()` คำนวณสดจากตั้งค่าที่เห็นอยู่ (รวมของที่ยังไม่บันทึก)
 *   2. snapshot เก่าจากแอป Streamlit — ใช้ตอน engine ฝั่ง TS ยังคำนวณไม่ได้
 * ⚠️⚠️ **ห้ามเดาตัวเลขเองเด็ดขาด** ถ้า engine โยน error ให้บอกตรง ๆ ว่ายังคำนวณสดไม่ได้
 * เลขที่ไม่มีใครรู้ที่มา แย่กว่าไม่มีเลข
 *
 * สิทธิ์: ต้องมี `canViewLottery` ถึงจะเห็น · **แก้ได้เฉพาะผู้ดูแล** (`isAdmin`) คนอื่นอ่านอย่างเดียว
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { LegEditor } from "@/components/portfolio/LegEditor";
import { SnapshotView } from "@/components/portfolio/SnapshotView";
import { digitsOfPosition, legCost, stableJson } from "@/components/portfolio/leg-utils";
import { Alert, Chip, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatBahtShort } from "@/lib/format";
import type { LotteryPortfolio, PortfolioConfig } from "@/lib/lottery/portfolio-config";
import {
  computeSnapshot,
  requiredSequenceKeys,
  type DatasetSequence,
} from "@/lib/lottery/portfolio-engine";
import type { PortfolioSnapshot } from "@/lib/types";

/** 1 แถวของตาราง `lottery_portfolios` ที่ API ส่งมา (คีย์ snake_case เหมือนฝั่ง Python) */
interface PortfolioRow {
  id: number;
  name: string;
  source: string | null;
  capital: number;
  config: PortfolioConfig;
  is_active: boolean;
  updated_at: string;
}

interface SnapshotResponse {
  portfolios: { portfolioId: number; name: string; isActive: boolean; generatedAt: string }[];
  snapshot: PortfolioSnapshot | null;
}

/** ผลหวย 1 แถวจาก `/api/lottery/datasets?lottery=&position=` */
interface EntryRow {
  lottery: string;
  position: string;
  year: string;
  flag: string;
  sequence: string;
  /** API ยังไม่ส่ง 2 ตัวนี้มา — เผื่อไว้ให้หยิบใช้ทันทีเมื่อฝั่งนั้นเพิ่มให้ */
  digits?: number;
  is_date_sorted?: boolean;
}

function thaiDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toPortfolio(row: PortfolioRow): LotteryPortfolio {
  return { id: row.id, name: row.name, source: row.source, capital: row.capital, config: row.config };
}

/** คีย์ของผลหวย 1 ปี-กลุ่ม (เดิมอยู่ใน rank-preview ที่ตัดทิ้งไปพร้อมแผงเลือกสูตร) */
function seqKey(lottery: string, position: string, year: string): string {
  return `${lottery}|${position}|${year}`;
}

export default function PortfolioPage() {
  const { api, canViewLottery, isAdmin } = useAuth();

  const [rows, setRows] = useState<PortfolioRow[] | null>(null);
  const [rowsError, setRowsError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<LotteryPortfolio | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [sequences, setSequences] = useState<Map<string, DatasetSequence>>(new Map());
  const [seqError, setSeqError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const [legacy, setLegacy] = useState<SnapshotResponse | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  /** หน้าเดียวทำ 2 เรื่อง (ดูผล/แก้ตั้งค่า) — กองรวมกันแล้วหาของไม่เจอ จึงแยกเป็นแท็บ */
  const [tab, setTab] = useState<"result" | "edit">("result");

  /* ───────────────── โหลดรายการพอร์ต (ตัวตั้งค่า) ───────────────── */
  const loadPortfolios = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api<{ portfolios: PortfolioRow[] }>("/api/lottery/portfolios");
      setRows(data.portfolios);
      setRowsError(null);
    } catch (caught) {
      setRows([]);
      setRowsError(caught instanceof Error ? caught.message : "โหลดรายการพอร์ตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!canViewLottery) {
      setLoading(false);
      return;
    }
    void loadPortfolios();
  }, [canViewLottery, loadPortfolios]);

  // พอร์ตแรกในลิสต์ = ตัวที่ API เรียง "ใช้จริง" ขึ้นก่อนให้แล้ว
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    setSelectedId((current) => (current !== null && rows.some((row) => row.id === current) ? current : rows[0].id));
  }, [rows]);

  const serverRow = rows?.find((row) => row.id === selectedId) ?? null;

  // ของบนเซิร์ฟเวอร์เปลี่ยน (สลับพอร์ต หรือเพิ่งบันทึกสำเร็จ) = เริ่มสำเนาใหม่จากของจริง
  useEffect(() => {
    setDraft(serverRow ? toPortfolio(serverRow) : null);
  }, [serverRow]);

  // ⚠️ ล้างข้อความผลการบันทึก **เฉพาะตอนสลับพอร์ต** — ถ้าไปล้างตอน serverRow เปลี่ยนด้วย
  // ข้อความ "บันทึกแล้ว" จะถูกลบทิ้งทันทีที่บันทึกสำเร็จ (เพราะ setRows ทำให้ serverRow เปลี่ยน)
  useEffect(() => {
    setSaveError(null);
    setSavedNote(null);
  }, [selectedId]);

  const dirty = useMemo(
    () => Boolean(draft && serverRow) && stableJson(draft) !== stableJson(toPortfolio(serverRow as PortfolioRow)),
    [draft, serverRow],
  );

  /* ───────────────── ผลหวยที่ต้องใช้คำนวณ ───────────────── */
  const loadGroupSequences = useCallback(
    (lottery: string, position: string) => {
      const key = `${lottery}|${position}`;
      if (pending.current.has(key)) return;
      pending.current.add(key);
      void (async () => {
        try {
          const query = new URLSearchParams({ lottery, position });
          const data = await api<{ entries: EntryRow[] }>(`/api/lottery/datasets?${query}`);
          setSequences((current) => {
            const next = new Map(current);
            for (const entry of data.entries) {
              next.set(seqKey(entry.lottery, entry.position, entry.year), {
                lottery: entry.lottery,
                position: entry.position,
                year: entry.year,
                digits: entry.digits ?? digitsOfPosition(entry.position),
                sequence: entry.sequence,
                // entry ที่ไม่ได้เรียงตามวันที่ → ตัดเดือนไม่ได้ (index แปลงเป็นวันที่ไม่ได้)
                // API ส่งค่าจริงมาแล้ว · ไม่มีค่า = ถือว่าเรียง (ทุกแถวตอนนี้เป็น true)
                isDateSorted: entry.is_date_sorted ?? true,
              });
            }
            return next;
          });
        } catch (caught) {
          pending.current.delete(key);
          setSeqError(caught instanceof Error ? caught.message : "โหลดผลหวยไม่สำเร็จ");
        }
      })();
    },
    [api],
  );

  // ขาไหนอยู่ในพอร์ต = ต้องมีผลหวยของหวย/ตำแหน่งนั้นครบทุกปีที่ขาใช้
  useEffect(() => {
    if (!draft) return;
    const seen = new Set<string>();
    for (const leg of draft.config.legs) {
      const key = `${leg.lottery}|${leg.position}`;
      if (seen.has(key)) continue;
      seen.add(key);
      loadGroupSequences(leg.lottery, leg.position);
    }
  }, [draft, loadGroupSequences]);

  /* ───────────────── snapshot เก่าจากแอป Streamlit (ตัวสำรอง) ───────────────── */
  useEffect(() => {
    if (!canViewLottery) return;
    void (async () => {
      try {
        const query = selectedId === null ? "" : `?id=${selectedId}`;
        setLegacy(await api<SnapshotResponse>(`/api/portfolio/snapshot${query}`));
      } catch {
        setLegacy(null);
      }
    })();
  }, [api, canViewLottery, selectedId]);

  /* ───────────────── คำนวณสด ───────────────── */
  const computed = useMemo((): { snapshot: PortfolioSnapshot | null; error: string | null } => {
    if (!draft) return { snapshot: null, error: null };
    if (draft.config.legs.length === 0) return { snapshot: null, error: "พอร์ตนี้ยังไม่มีขา" };

    const missing = requiredSequenceKeys(draft)
      .filter((key) => !sequences.has(seqKey(key.lottery, key.position, key.year)))
      .map((key) => `${key.lottery} ${key.position} 25${key.year}`);
    if (missing.length > 0) {
      return { snapshot: null, error: `ยังไม่มีผลหวยที่ต้องใช้: ${[...new Set(missing)].slice(0, 4).join(" · ")}` };
    }

    try {
      return { snapshot: computeSnapshot({ portfolio: draft, sequences: [...sequences.values()] }), error: null };
    } catch (caught) {
      return { snapshot: null, error: caught instanceof Error ? caught.message : "คำนวณไม่สำเร็จ" };
    }
  }, [draft, sequences]);

  /* ───────────────── บันทึก ───────────────── */
  const save = useCallback(async () => {
    if (!draft) return;
    setSaving(true);
    setSaveError(null);
    try {
      const data = await api<{ portfolio: PortfolioRow }>("/api/lottery/portfolios", {
        method: "PUT",
        body: JSON.stringify({
          id: draft.id,
          name: draft.name,
          source: draft.source,
          capital: draft.capital,
          config: draft.config,
        }),
      });
      setRows((current) =>
        (current ?? []).map((row) => (row.id === data.portfolio.id ? data.portfolio : row)),
      );
      setSavedNote(`บันทึกแล้วเมื่อ ${thaiDateTime(new Date().toISOString())}`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [api, draft]);

  /* ───────────────── หน้าจอ ───────────────── */
  if (!canViewLottery) {
    return (
      <div className="space-y-3.5">
        <PageHeader title="พอร์ต" />
        <Alert tone="warn">หน้านี้เปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต</Alert>
      </div>
    );
  }

  const legacySnapshot = legacy?.snapshot ?? null;
  const totalCost = draft ? draft.config.legs.reduce((sum, leg) => sum + legCost(leg), 0) : 0;

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="พอร์ต"
        subtitle={
          draft
            ? `${draft.name} · ${draft.config.legs.length} ขา · ทุน ${formatBahtShort(draft.capital)} บ.`
            : "ตั้งค่าพอร์ตและผลย้อนหลัง"
        }
      />

      {loading ? <Spinner label="กำลังโหลด..." /> : null}

      {rowsError ? (
        <Alert tone="warn" title="ยังแก้พอร์ตที่นี่ไม่ได้">
          {rowsError}
          <br />
          ด้านล่างเป็นผลที่แอปหวย (Streamlit) คำนวณส่งมาเก็บไว้ — ดูได้ แต่แก้ไม่ได้
        </Alert>
      ) : null}

      {(rows?.length ?? 0) > 1 ? (
        <div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {rows?.map((row) => (
              <Chip
                key={row.id}
                active={selectedId === row.id}
                onClick={() => {
                  if (dirty && row.id !== selectedId) return;
                  setSelectedId(row.id);
                }}
              >
                {row.is_active ? `★ ${row.name}` : row.name}
              </Chip>
            ))}
          </div>
          {dirty ? (
            <p className="dim mt-1 text-[10.5px]">สลับพอร์ตไม่ได้ตอนนี้ — บันทึกหรือกดยกเลิกของที่แก้ค้างไว้ก่อน</p>
          ) : null}
        </div>
      ) : null}

      {!loading && rows && rows.length === 0 && !legacySnapshot ? (
        <div className="card px-4 py-5">
          <EmptyState>ยังไม่มีพอร์ตในระบบ</EmptyState>
          <p className="muted text-center text-[12px] leading-relaxed">
            นำเข้าจากแอปหวยก่อน แล้วค่อยมาแก้ที่นี่
            <br />
            <code className="text-[11px]">python3 scripts/export_portfolios.py --post</code>
          </p>
        </div>
      ) : null}

      {/* ───── 2 แท็บ: ดูผล / แก้ตั้งค่า — หน้าเดียวทำสองเรื่องแล้วหาของไม่เจอ ───── */}
      {draft && isAdmin ? (
        <div className="flex gap-1.5">
          <Chip active={tab === "result"} onClick={() => setTab("result")}>
            📊 ผลย้อนหลัง
          </Chip>
          <Chip active={tab === "edit"} onClick={() => setTab("edit")}>
            ✏️ แก้ตั้งค่า
          </Chip>
        </div>
      ) : null}

      {/* ───── แท็บแก้ไข — มีแค่ ชุดเลข · เรตจ่าย · เงินแทง ───── */}
      {draft && isAdmin && tab === "edit" ? (
        <div className="space-y-2.5">
          {draft.config.legs.map((leg, index) => (
            <LegEditor
              key={`${leg.lottery}|${leg.position}|${index}`}
              leg={leg}
              index={index}
              onChange={(next) => {
                const legs = [...draft.config.legs];
                legs[index] = next;
                setDraft({ ...draft, config: { ...draft.config, legs } as PortfolioConfig });
              }}
            />
          ))}
          <p className="dim px-1 text-[10.5px] leading-relaxed">
            ต้นทุนรวมทุกขา <b>{formatBahtShort(totalCost)}</b> บ./งวด
            <br />
            เพิ่ม/ลบขา · เปลี่ยนหวย · เปลี่ยนสูตร ยังต้องทำที่แอปเดิม (Streamlit)
          </p>
        </div>
      ) : null}

      {seqError ? <Alert tone="warn">โหลดผลหวยบางส่วนไม่สำเร็จ: {seqError}</Alert> : null}
      {saveError ? <Alert tone="error">{saveError}</Alert> : null}
      {savedNote && !dirty ? <Alert tone="success">{savedNote}</Alert> : null}

      {/* ───── ผลย้อนหลัง ───── */}
      {tab === "edit" && isAdmin ? null : computed.snapshot ? (
        <>
          <Alert tone={dirty ? "warn" : "info"}>
            {dirty
              ? "ตัวเลขข้างล่างคำนวณสดจากสิ่งที่แก้อยู่ — ยังไม่ได้บันทึก"
              : "ตัวเลขข้างล่างคำนวณสดจากตั้งค่าปัจจุบันของพอร์ตนี้"}
          </Alert>
          <SnapshotView
            snapshot={computed.snapshot}
            showNumbers={showNumbers}
            onToggleNumbers={() => setShowNumbers((value) => !value)}
          />
        </>
      ) : (
        <>
          {computed.error ? (
            <Alert tone="warn" title="ยังคำนวณสดไม่ได้">
              {computed.error}
              <br />
              ไม่เดาตัวเลขให้ — เลขที่ไม่รู้ที่มาแย่กว่าไม่มีเลข
            </Alert>
          ) : null}

          {legacySnapshot ? (
            <>
              <Alert tone="info">
                ด้านล่างเป็นตัวเลขจาก<b>แอปเดิม (Streamlit)</b> ที่ส่งมาเก็บไว้เมื่อ{" "}
                {thaiDateTime(legacySnapshot.generatedAt)} — <b>ยังไม่รวมสิ่งที่แก้ในหน้านี้</b>
              </Alert>
              <SnapshotView
                snapshot={legacySnapshot}
                showNumbers={showNumbers}
                onToggleNumbers={() => setShowNumbers((value) => !value)}
              />
            </>
          ) : null}
        </>
      )}

      {/* ───── แถบบันทึก — ลอยเหนือเมนูล่าง โผล่เฉพาะตอนมีของค้าง ───── */}
      {isAdmin && dirty && draft ? (
        <div className="sticky bottom-24 z-10">
          <div
            className="card flex items-center gap-2 px-3 py-2.5"
            style={{ boxShadow: "0 10px 26px rgb(22 36 61 / 0.22)" }}
          >
            <span className="flex-1 text-[12px] leading-tight font-semibold">
              ⚠️ ยังไม่ได้บันทึก
              <span className="dim block text-[10.5px] font-normal">กด “บันทึก” ถึงจะเก็บของจริง</span>
            </span>
            <button
              type="button"
              className="btn btn-ghost flex-none py-2 text-[12.5px]"
              disabled={saving}
              onClick={() => setDraft(serverRow ? toPortfolio(serverRow) : null)}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              className="btn btn-primary flex-none py-2 text-[12.5px]"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "กำลังบันทึก..." : "💾 บันทึก"}
            </button>
          </div>
        </div>
      ) : null}

      <p className="dim px-1 pb-1 text-center text-[10.5px] leading-relaxed">
        ตัวเลขทั้งหมดเป็นผลย้อนหลัง ไม่ใช่การรับประกันผลในอนาคต
      </p>
    </div>
  );
}
