"use client";

/**
 * พอร์ตหวย — เลือก/สร้าง/ลบพอร์ต · แก้ตั้งค่าและขา · ดูผลย้อนหลัง
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
 * ⚠️ ผลหวยยังมาจากแอปเดิม (Streamlit) ทางเดียว ⇒ ขาที่หวย/ตำแหน่งนั้นยังไม่ถูก sync
 * มาจะคำนวณไม่ได้ · หน้าจอต้องบอก **ชื่อกลุ่มที่ขาด + วิธีเติม** ไม่ใช่ขึ้นว่า
 * "โหลดไม่สำเร็จ" เฉย ๆ แล้วปล่อยให้ไปเดาเอาเองว่าต้องทำอะไรต่อ
 *
 * สิทธิ์: ต้องมี `canViewLottery` ถึงจะเห็น · **แก้/สร้าง/ลบได้เฉพาะผู้ดูแล** (`isAdmin`)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ApiError, useAuth } from "@/components/LiffProvider";
import { LegEditor } from "@/components/portfolio/LegEditor";
import { LegPicker } from "@/components/portfolio/LegPicker";
import { PortfolioMeta } from "@/components/portfolio/PortfolioMeta";
import { ScheduleEditor } from "@/components/portfolio/ScheduleEditor";
import { SnapshotView } from "@/components/portfolio/SnapshotView";
import {
  digitsOfPosition,
  legCost,
  legLabel,
  newManualLeg,
  newPortfolioDraft,
  stableJson,
  type DatasetGroup,
} from "@/components/portfolio/leg-utils";
import { Alert, Chip, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatBahtShort } from "@/lib/format";
import type { LotteryPortfolio, PortfolioConfig } from "@/lib/lottery/portfolio-config";
import {
  computeSnapshot,
  requiredSequenceKeys,
  type DatasetSequence,
} from "@/lib/lottery/portfolio-engine";
import { comparePositions, minutesOf, scheduleTimes } from "@/lib/lottery/day-result";
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

/**
 * พอร์ตที่กำลังแก้อยู่บนหน้าจอ — `id === null` คือ **พอร์ตใหม่ที่ยังไม่ได้บันทึก**
 * (ฝั่ง API เป็นคนตั้งเลข id ให้ตอนบันทึกครั้งแรก ที่นี่ตั้งเองไม่ได้ เดี๋ยวชนกับของเดิม)
 */
type DraftPortfolio = Omit<LotteryPortfolio, "id"> & { id: number | null };

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

function toDraft(row: PortfolioRow): DraftPortfolio {
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
  const [draft, setDraft] = useState<DraftPortfolio | null>(null);
  const [loading, setLoading] = useState(true);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [sequences, setSequences] = useState<Map<string, DatasetSequence>>(new Map());
  /** กลุ่มที่ตารางผลหวยยังไม่มีเลย (404) — คนละเรื่องกับ "โหลดล้มเหลว" ที่ลองใหม่ได้ */
  const [missingGroups, setMissingGroups] = useState<string[]>([]);
  const [seqError, setSeqError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());

  const [legacy, setLegacy] = useState<SnapshotResponse | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  /** หน้าเดียวทำ 2 เรื่อง (ดูผล/แก้ตั้งค่า) — กองรวมกันแล้วหาของไม่เจอ จึงแยกเป็นแท็บ */
  const [tab, setTab] = useState<"result" | "edit">("result");

  /** รายชื่อหวยที่เลือกได้ตอนเพิ่มขา — โหลดเมื่อเปิดแผงเท่านั้น (ไม่ใช้ก็ไม่ต้องดึง) */
  const [picking, setPicking] = useState(false);
  const [groups, setGroups] = useState<DatasetGroup[] | null>(null);
  const [groupsError, setGroupsError] = useState<string | null>(null);

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
  // (ระหว่างสร้างพอร์ตใหม่ selectedId เป็น null โดยตั้งใจ — อย่าลากกลับไปพอร์ตเก่า)
  const creating = draft?.id === null;
  useEffect(() => {
    if (!rows || rows.length === 0) return;
    setSelectedId((current) => {
      if (current !== null && rows.some((row) => row.id === current)) return current;
      return creating ? current : rows[0].id;
    });
  }, [rows, creating]);

  const serverRow = rows?.find((row) => row.id === selectedId) ?? null;

  // ของบนเซิร์ฟเวอร์เปลี่ยน (สลับพอร์ต หรือเพิ่งบันทึกสำเร็จ) = เริ่มสำเนาใหม่จากของจริง
  // ⚠️ `serverRow === null` แปลว่ากำลังสร้างพอร์ตใหม่ (หรือยังไม่มีพอร์ตเลย) — ห้ามล้าง
  //    draft ทิ้ง ไม่งั้นสิ่งที่เพิ่งกรอกหายทันทีที่ React เรนเดอร์รอบถัดไป
  useEffect(() => {
    if (!serverRow) return;
    setDraft(toDraft(serverRow));
  }, [serverRow]);

  // ⚠️ ล้างข้อความผลการบันทึก **เฉพาะตอนสลับพอร์ต** — ถ้าไปล้างตอน serverRow เปลี่ยนด้วย
  // ข้อความ "บันทึกแล้ว" จะถูกลบทิ้งทันทีที่บันทึกสำเร็จ (เพราะ setRows ทำให้ serverRow เปลี่ยน)
  useEffect(() => {
    setSaveError(null);
    setSavedNote(null);
    setPicking(false);
  }, [selectedId]);

  const dirty = useMemo(() => {
    if (!draft) return false;
    // พอร์ตใหม่ยังไม่มีของเทียบบนเซิร์ฟเวอร์ = ยังไม่ได้บันทึกแน่นอน
    if (draft.id === null) return true;
    return Boolean(serverRow) && stableJson(draft) !== stableJson(toDraft(serverRow as PortfolioRow));
  }, [draft, serverRow]);

  /* ───────────────── ผลหวยที่ต้องใช้คำนวณ ───────────────── */
  const loadGroupSequences = useCallback(
    (lottery: string, position: string, flag: string) => {
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
                isDateSorted: entry.is_date_sorted ?? true,
              });
            }
            return next;
          });
        } catch (caught) {
          // 404 = ตารางผลหวยยังไม่มีหวย/ตำแหน่งนี้เลย → **ลองใหม่ไปก็เท่านั้น**
          // ปล่อยคีย์ค้างใน pending ไว้ ไม่งั้นทุกครั้งที่พิมพ์แก้ขาจะยิงซ้ำทั้งชุด
          if (caught instanceof ApiError && caught.code === "not_found") {
            const label = legLabel(flag, lottery, position);
            setMissingGroups((current) => (current.includes(label) ? current : [...current, label]));
            return;
          }
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
      loadGroupSequences(leg.lottery, leg.position, leg.flag ?? "🎰");
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

    // id ยังไม่มีตอนพอร์ตใหม่ — engine ใช้แค่โชว์ ไม่ได้เอาไปหาข้อมูลอะไรต่อ
    const portfolio: LotteryPortfolio = { ...draft, id: draft.id ?? 0 };
    const missing = requiredSequenceKeys(portfolio)
      .filter((key) => !sequences.has(seqKey(key.lottery, key.position, key.year)))
      .map((key) => `${key.lottery} ${key.position} 25${key.year}`);
    if (missing.length > 0) {
      return { snapshot: null, error: `ยังไม่มีผลหวยที่ต้องใช้: ${[...new Set(missing)].slice(0, 4).join(" · ")}` };
    }

    try {
      return { snapshot: computeSnapshot({ portfolio, sequences: [...sequences.values()] }), error: null };
    } catch (caught) {
      return { snapshot: null, error: caught instanceof Error ? caught.message : "คำนวณไม่สำเร็จ" };
    }
  }, [draft, sequences]);

  /* ───────────────── สร้าง / บันทึก / ลบ ───────────────── */
  const startCreate = useCallback(() => {
    setDraft(newPortfolioDraft(""));
    setSelectedId(null);
    setSaveError(null);
    setSavedNote(null);
    setTab("edit");
    setPicking(false);
  }, []);

  const loadGroups = useCallback(async () => {
    if (groups) return;
    try {
      // ไม่ใส่ `digits` — พอร์ตมีขาสามบนได้ ต่างจากหน้าเลือกสูตรที่เป็นสูตร 2 ตัวล้วน
      const data = await api<{ groups: DatasetGroup[] }>("/api/lottery/datasets");
      setGroups(data.groups);
      setGroupsError(null);
    } catch (caught) {
      setGroupsError(caught instanceof Error ? caught.message : "โหลดรายชื่อหวยไม่สำเร็จ");
    }
  }, [api, groups]);

  const openPicker = useCallback(() => {
    setPicking(true);
    void loadGroups();
  }, [loadGroups]);

  const save = useCallback(async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      setSaveError("ยังไม่ได้ตั้งชื่อพอร์ต");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const data = await api<{ portfolio: PortfolioRow }>("/api/lottery/portfolios", {
        method: "PUT",
        body: JSON.stringify({
          // ไม่ส่ง id = พอร์ตใหม่ (ฝั่ง API ตั้งเลขต่อจากตัวที่มากสุดให้)
          ...(draft.id === null ? {} : { id: draft.id }),
          name: draft.name.trim(),
          source: draft.source,
          capital: draft.capital,
          config: draft.config,
        }),
      });
      const saved = data.portfolio;
      setRows((current) => {
        const list = current ?? [];
        return list.some((row) => row.id === saved.id)
          ? list.map((row) => (row.id === saved.id ? saved : row))
          : [...list, saved];
      });
      setSelectedId(saved.id);
      setDraft(toDraft(saved));
      setSavedNote(`บันทึกแล้วเมื่อ ${thaiDateTime(new Date().toISOString())}`);
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }, [api, draft]);

  const removePortfolio = useCallback(async () => {
    if (!draft) return;
    // พอร์ตใหม่ที่ยังไม่ได้บันทึก = ไม่มีอะไรให้ลบฝั่งเซิร์ฟเวอร์ แค่ทิ้งสำเนาบนจอ
    if (draft.id === null) {
      setDraft(null);
      setSelectedId(rows?.[0]?.id ?? null);
      return;
    }
    setDeleting(true);
    setSaveError(null);
    try {
      const id = draft.id;
      await api(`/api/lottery/portfolios?id=${id}`, { method: "DELETE" });
      const left = (rows ?? []).filter((row) => row.id !== id);
      setRows(left);
      setDraft(left.length > 0 ? toDraft(left[0]) : null);
      setSelectedId(left[0]?.id ?? null);
      setSavedNote(`ลบพอร์ตแล้ว — เหลือ ${left.length} พอร์ต`);
      setTab("result");
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "ลบพอร์ตไม่สำเร็จ");
    } finally {
      setDeleting(false);
    }
  }, [api, draft, rows]);

  /* ───────────────── หน้าจอ ───────────────── */
  if (!canViewLottery) {
    return (
      <div className="space-y-3.5">
        <PageHeader title="พอร์ต" />
        <Alert tone="warn">หน้านี้เปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต</Alert>
      </div>
    );
  }

  // ระหว่างสร้างพอร์ตใหม่ยังไม่มี id → API คืน snapshot ของ "พอร์ตแรกที่เจอ" มาให้
  // ⇒ ต้องไม่เอามาโชว์ ไม่งั้นพอร์ตเปล่าจะมีกราฟของพอร์ตอื่นห้อยอยู่ข้างล่าง
  const legacySnapshot = creating ? null : (legacy?.snapshot ?? null);
  const legs = draft?.config.legs ?? [];
  // เอาเฉพาะกลุ่มที่ **พอร์ตที่กำลังดูอยู่** ใช้จริง — `missingGroups` สะสมข้ามพอร์ต
  // (ยิงครั้งเดียวต่อกลุ่มทั้งหน้า) ถ้าโชว์ทั้งหมดจะขึ้นชื่อหวยของพอร์ตอื่นมาปนให้งง
  const missingHere = missingGroups.filter((label) =>
    legs.some((leg) => legLabel(leg.flag ?? "🎰", leg.lottery, leg.position) === label),
  );
  const totalCost = legs.reduce((sum, leg) => sum + legCost(leg), 0);
  const showEdit = Boolean(draft) && isAdmin && tab === "edit";

  /**
   * ลำดับที่โชว์ในแท็บแก้ไข = ลำดับที่หวยออกจริง (เวลาใน `schedule.lottery_times`)
   * แล้วในหวยเดียวกันเป็น **สามบน → สองบน → สองล่าง** — ตรงกับฟอร์มกรอกผลและการ์ด LINE
   * ⚠️ เก็บ `index` เดิมของ config ติดไปด้วย เพราะปุ่มแก้/ลบอ้างตำแหน่งจริงในอาร์เรย์
   */
  const orderedLegs = useMemo(() => {
    const times = draft ? scheduleTimes(draft) : {};
    const lotteryOrder = new Map<string, number>();
    legs.forEach((leg) => {
      if (!lotteryOrder.has(leg.lottery)) lotteryOrder.set(leg.lottery, lotteryOrder.size);
    });
    return legs
      .map((leg, index) => ({ leg, index }))
      .sort((a, b) => {
        if (a.leg.lottery !== b.leg.lottery) {
          return (
            minutesOf(times[a.leg.lottery] ?? null) - minutesOf(times[b.leg.lottery] ?? null) ||
            (lotteryOrder.get(a.leg.lottery) ?? 0) - (lotteryOrder.get(b.leg.lottery) ?? 0)
          );
        }
        return (
          comparePositions(
            { digits: a.leg.digits ?? 2, position: a.leg.position },
            { digits: b.leg.digits ?? 2, position: b.leg.position },
          ) || a.index - b.index
        );
      });
  }, [legs, draft]);

  const setLegs = (next: typeof legs) => {
    if (!draft) return;
    setDraft({ ...draft, config: { ...draft.config, legs: next } as PortfolioConfig });
  };

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="พอร์ต"
        subtitle={
          draft
            ? `${draft.name || "พอร์ตใหม่"} · ${legs.length} ขา · ทุน ${formatBahtShort(draft.capital)} บ.`
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

      {!loading && rows && !rowsError ? (
        <div>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {rows.map((row) => (
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
            {creating ? <Chip active onClick={() => undefined}>{draft?.name || "พอร์ตใหม่"}</Chip> : null}
            {isAdmin && !creating ? (
              <Chip
                active={false}
                onClick={() => {
                  if (dirty) return;
                  startCreate();
                }}
              >
                ➕ พอร์ตใหม่
              </Chip>
            ) : null}
          </div>
          {dirty ? (
            <p className="dim mt-1 text-[10.5px]">
              สลับ/สร้างพอร์ตไม่ได้ตอนนี้ — บันทึกหรือกดยกเลิกของที่แก้ค้างไว้ก่อน
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && rows && rows.length === 0 && !creating && !legacySnapshot ? (
        <div className="card px-4 py-5">
          <EmptyState>ยังไม่มีพอร์ตในระบบ</EmptyState>
          <p className="muted text-center text-[12px] leading-relaxed">
            {isAdmin ? "กด “➕ พอร์ตใหม่” ด้านบนเพื่อสร้างเอง" : "ยังไม่มีใครสร้างพอร์ตไว้"}
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

      {/* ───── แท็บแก้ไข ───── */}
      {showEdit && draft ? (
        <div className="space-y-2.5">
          <PortfolioMeta
            name={draft.name}
            capital={draft.capital}
            config={draft.config}
            legCount={legs.length}
            isNew={draft.id === null}
            deleting={deleting}
            onChangeName={(name) => setDraft({ ...draft, name })}
            onChangeCapital={(capital) => setDraft({ ...draft, capital })}
            onChangeConfig={(config) => setDraft({ ...draft, config })}
            onDelete={() => void removePortfolio()}
          />

          {/* เวลาออกผล = ลำดับของฟอร์มกรอกผลและการ์ด LINE ⇒ อยู่ถัดจากชื่อ/ทุนเลย */}
          <ScheduleEditor
            legs={legs}
            config={draft.config}
            onChange={(config) => setDraft({ ...draft, config })}
          />

          {/* เรียงตามที่หวยออกจริง แล้วในหวยเดียวกันเป็น สามบน → สองบน → สองล่าง
              ⚠️ `index` ที่ส่งให้ LegEditor ต้องเป็น **ตำแหน่งจริงใน config** ไม่ใช่ลำดับที่โชว์
              ไม่งั้นแก้/ลบไปโดนขาอื่น */}
          {orderedLegs.map(({ leg, index }) => (
            <LegEditor
              key={`${leg.lottery}|${leg.position}|${index}`}
              leg={leg}
              index={index}
              onChange={(next) => setLegs(legs.map((item, i) => (i === index ? next : item)))}
              onRemove={() => setLegs(legs.filter((_, i) => i !== index))}
            />
          ))}

          {picking ? (
            <LegPicker
              groups={groups ?? []}
              loading={groups === null && groupsError === null}
              error={groupsError}
              onAdd={(group, testYear) => {
                setLegs([...legs, newManualLeg(group, testYear, legs)]);
                setPicking(false);
              }}
              onCancel={() => setPicking(false)}
            />
          ) : (
            <button type="button" className="btn btn-ghost w-full py-2.5 text-[13px]" onClick={openPicker}>
              ➕ เพิ่มขา
            </button>
          )}

          <p className="dim px-1 text-[10.5px] leading-relaxed">
            ต้นทุนรวมทุกขา <b>{formatBahtShort(totalCost)}</b> บ./งวด
            <br />
            ขาที่เพิ่มที่นี่เป็นแบบ <b>กำหนดเลขเอง</b> — ขาที่ให้สูตรเลือกเลขให้ยังต้องตั้งที่แอปเดิม
          </p>
        </div>
      ) : null}

      {seqError ? <Alert tone="warn">โหลดผลหวยบางส่วนไม่สำเร็จ: {seqError}</Alert> : null}
      {saveError ? <Alert tone="error">{saveError}</Alert> : null}
      {savedNote && !dirty ? <Alert tone="success">{savedNote}</Alert> : null}

      {/* ───── ผลย้อนหลัง ───── */}
      {showEdit ? null : computed.snapshot ? (
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
              {/* ผลหวยเข้ามาทางเดียวจากแอปเดิม ⇒ ถ้ากลุ่มไหนยังไม่เคยถูกส่งมา
                  ต้องบอกวิธีเติมตรงนี้เลย ไม่ใช่ให้ไปนั่งเดาว่าทำไมกราฟหาย */}
              {missingHere.length > 0 ? (
                <>
                  <br />
                  <br />
                  <b>ตารางผลหวยที่นี่ยังไม่มี:</b> {missingHere.join(" · ")}
                  <br />
                  เติมได้จากแอปเดิม (Streamlit) — บันทึกผลหวยที่หน้า 📝 กรอกผลส่งไลน์ อีกครั้ง
                  หรือรัน <code className="text-[11px]">python3 scripts/sync_to_supabase.py</code>
                </>
              ) : null}
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
              onClick={() => {
                setDraft(serverRow ? toDraft(serverRow) : null);
                setSelectedId((current) => current ?? rows?.[0]?.id ?? null);
                setPicking(false);
              }}
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
