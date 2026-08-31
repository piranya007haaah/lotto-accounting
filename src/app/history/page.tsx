"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { OwnerPicker } from "@/components/OwnerPicker";
import { SitePicker } from "@/components/SitePicker";
import { Alert, AvatarCircle, Chip, EmptyState, PageHeader, SiteBadge, Spinner } from "@/components/ui";
import { formatBahtShort, parseAmountInput } from "@/lib/format";
import { BANK_CHOICES } from "@/lib/thai-banks";
import {
  currentMonthKey,
  formatDateKey,
  formatThaiDate,
  pad2,
  toDatetimeLocalValue,
  zonedParts,
} from "@/lib/thai-date";
import type { Direction, SiteRow, TransactionWithSite } from "@/lib/types";

interface EditState {
  id: string;
  siteId: string;
  direction: Direction;
  amount: string;
  occurredAtLocal: string;
  /** ธนาคารของบัญชีเรา — แก้ตรงนี้ได้ เผื่อรายการเก่าที่อ่านจากรูปไม่ได้ */
  bankName: string;
  note: string;
}

/** ตัวเลือกธนาคาร — เติมชื่อที่บันทึกไว้เข้าไปด้วยถ้าเขียนไม่เหมือนในรายการ */
function bankOptions(current: string): string[] {
  const list: string[] = [...BANK_CHOICES];
  return current && !list.includes(current) ? [current, ...list] : list;
}

type RangeMode = "today" | "yesterday" | "last7" | "last30" | "month";

const RANGES: Array<{ value: RangeMode; label: string }> = [
  { value: "today", label: "วันนี้" },
  { value: "yesterday", label: "เมื่อวาน" },
  { value: "last7", label: "7 วัน" },
  { value: "last30", label: "30 วัน" },
  { value: "month", label: "รายเดือน" },
];

const OCR_LABEL: Record<string, string> = {
  ocr: "อ่านจากรูป",
  ocr_edited: "อ่านจากรูป + แก้",
  manual: "กรอกเอง",
  failed: "อ่านรูปไม่ออก",
};

export default function HistoryPage() {
  const { api, canViewAll, isAdmin, userId, viewOwner } = useAuth();

  const [mode, setMode] = useState<RangeMode>("month");
  const [month, setMonth] = useState(() => currentMonthKey());
  const [rangeLabel, setRangeLabel] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [directionFilter, setDirectionFilter] = useState("");

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [rows, setRows] = useState<TransactionWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<EditState | null>(null);
  const [busy, setBusy] = useState(false);
  const [filterPickerOpen, setFilterPickerOpen] = useState(false);
  const [editPickerOpen, setEditPickerOpen] = useState(false);

  useEffect(() => {
    api<{ sites: SiteRow[] }>("/api/sites?all=1")
      .then((data) => setSites(data.sites))
      .catch(() => undefined);
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams(mode === "month" ? { month } : { range: mode });
      if (siteFilter) query.set("siteId", siteFilter);
      if (directionFilter) query.set("direction", directionFilter);
      if (viewOwner) query.set("ownerId", viewOwner.id);
      const data = await api<{ label: string; transactions: TransactionWithSite[] }>(
        `/api/transactions?${query}`,
      );
      setRows(data.transactions);
      setRangeLabel(data.label);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api, mode, month, siteFilter, directionFilter, viewOwner]);

  useEffect(() => {
    void load();
  }, [load]);

  /** ขอ signed URL ของรูปหนึ่งใบ — เก็บตาม path เพราะหนึ่งรายการมีได้สองรูป */
  const loadImage = useCallback(
    async (path: string) => {
      try {
        const data = await api<{ url: string }>(`/api/images?path=${encodeURIComponent(path)}`);
        setImageUrls((current) => (current[path] ? current : { ...current, [path]: data.url }));
      } catch {
        /* ดูรูปไม่ได้ก็ยังดูข้อมูลอื่นได้ */
      }
    },
    [api],
  );

  function toggleOpen(row: TransactionWithSite) {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    setEditing(null);
    if (!next) return;
    for (const path of [row.image_path, row.web_image_path]) {
      if (path && !imageUrls[path]) void loadImage(path);
    }
  }

  function startEdit(row: TransactionWithSite) {
    setEditing({
      id: row.id,
      siteId: row.site_id,
      direction: row.direction,
      amount: String(row.amount),
      occurredAtLocal: toDatetimeLocalValue(new Date(row.occurred_at)),
      bankName: row.bank_name ?? "",
      note: row.note ?? "",
    });
  }

  async function saveEdit() {
    if (!editing) return;
    const amount = parseAmountInput(editing.amount);
    if (amount === null) {
      setError("ยอดเงินไม่ถูกต้อง");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ transaction: TransactionWithSite }>(`/api/transactions/${editing.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          siteId: editing.siteId,
          direction: editing.direction,
          amount,
          occurredAtLocal: editing.occurredAtLocal,
          bankName: editing.bankName.trim() || null,
          note: editing.note || null,
        }),
      });
      const updated = { ...data.transaction, amount: Number(data.transaction.amount) };
      setRows((current) => current.map((row) => (row.id === updated.id ? updated : row)));
      setEditing(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "แก้ไขไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("ลบรายการนี้? รูปสลิปจะถูกลบไปด้วย")) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/transactions/${id}`, { method: "DELETE" });
      setRows((current) => current.filter((row) => row.id !== id));
      setOpenId(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const groups = new Map<string, TransactionWithSite[]>();
  for (const row of rows) {
    const key = formatDateKey(new Date(row.occurred_at));
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  // emoji มาจากรายชื่อเว็บที่โหลดไว้สำหรับตัวกรอง — join ของ transactions ไม่ต้องส่งมา
  const emojiById = new Map(sites.map((site) => [site.id, site.emoji ?? null]));

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="รายการทั้งหมด"
        subtitle={`${rangeLabel || "—"} · ${rows.length} รายการ${viewOwner ? ` · ของ ${viewOwner.name}` : ""}`}
      />

      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {RANGES.map((item) => (
          <Chip key={item.value} active={mode === item.value} onClick={() => setMode(item.value)}>
            {item.label}
          </Chip>
        ))}
      </div>

      <div className="card space-y-2 p-3">
        <OwnerPicker />
        {mode === "month" ? (
          <input type="month" className="field" value={month} onChange={(e) => setMonth(e.target.value)} />
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <SitePicker
            sites={sites}
            value={siteFilter}
            onChange={setSiteFilter}
            open={filterPickerOpen}
            onOpenChange={setFilterPickerOpen}
            allLabel="ทุกเว็บ"
          />
          <select className="field" value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
            <option value="">เข้า + ออก</option>
            <option value="deposit">เงินเข้าเว็บ</option>
            <option value="withdraw">เงินออกจากเว็บ</option>
          </select>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <Spinner label="กำลังโหลด…" /> : null}
      {!loading && rows.length === 0 ? <EmptyState>ยังไม่มีรายการในช่วงนี้</EmptyState> : null}

      {[...groups.entries()].map(([dateKey, items]) => {
        const dayDeposit = items.filter((i) => i.direction === "deposit").reduce((sum, i) => sum + i.amount, 0);
        const dayWithdraw = items.filter((i) => i.direction === "withdraw").reduce((sum, i) => sum + i.amount, 0);

        return (
          <section key={dateKey} className="card overflow-hidden">
            <div className="group-head flex items-baseline justify-between px-4 py-2.5">
              <span className="text-[13px] font-bold">{formatThaiDate(`${dateKey}T00:00:00Z`)}</span>
              <span className="tnum text-[11px]">
                <span style={{ color: "var(--color-money-in)" }}>{formatBahtShort(dayDeposit)}</span>
                <span className="dim"> / </span>
                <span style={{ color: "var(--color-money-out)" }}>{formatBahtShort(dayWithdraw)}</span>
              </span>
            </div>

            <ul>
              {items.map((row) => {
                const parts = zonedParts(new Date(row.occurred_at));
                const isOpen = openId === row.id;
                const isEditing = editing?.id === row.id;

                return (
                  <li key={row.id}>
                    <button
                      onClick={() => toggleOpen(row)}
                      className={
                        isOpen
                          ? "mx-2.5 mt-2 mb-1 flex w-[calc(100%-20px)] items-center gap-3 rounded-2xl px-3.5 py-3 text-left"
                          : "flex w-full items-center gap-3 px-4 py-3 text-left"
                      }
                      style={
                        isOpen
                          ? {
                              background: "var(--ink-btn)",
                              color: "var(--ink-btn-text)",
                              boxShadow: "0 6px 14px rgb(22 36 61 / 0.20)",
                            }
                          : undefined
                      }
                    >
                      <span
                        className="tnum w-10 flex-none text-xs"
                        style={{ color: isOpen ? "var(--nav-dim)" : "var(--dim)" }}
                      >
                        {pad2(parts.hour)}:{pad2(parts.minute)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2">
                          <SiteBadge
                            name={row.site?.name ?? "—"}
                            color={row.site?.color}
                            emoji={row.site ? emojiById.get(row.site.id) : null}
                          />
                          {/* ดูของคนเดียวอยู่แล้วไม่ต้องบอกซ้ำทุกแถว — บอกเฉพาะตอนดูรวมทุกคน */}
                          {canViewAll && !viewOwner ? (
                            <span
                              className="flex flex-none items-center gap-1 text-[11px]"
                              style={{ color: isOpen ? "var(--nav-dim)" : "var(--dim)" }}
                            >
                              <AvatarCircle
                                name={row.owner?.display_name}
                                src={row.owner?.picture_url}
                                size={15}
                              />
                              <span className="max-w-[90px] truncate">
                                {row.owner?.display_name ?? "(ไม่ทราบชื่อ)"}
                              </span>
                            </span>
                          ) : null}
                        </span>
                        {row.note ? (
                          <span
                            className="block truncate text-[11px]"
                            style={{ color: isOpen ? "var(--nav-dim)" : "var(--dim)" }}
                          >
                            {row.note}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className="tnum flex-none text-sm font-bold"
                        style={{
                          color:
                            row.direction === "deposit"
                              ? isOpen
                                ? "color-mix(in srgb, var(--color-money-in) 60%, var(--ink-btn-text))"
                                : "var(--color-money-in)"
                              : isOpen
                                ? "color-mix(in srgb, var(--color-money-out) 60%, var(--ink-btn-text))"
                                : "var(--color-money-out)",
                        }}
                      >
                        {row.direction === "deposit" ? "−" : "+"}
                        {formatBahtShort(row.amount)}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="space-y-3 px-4 pb-4">
                        {row.image_path || row.web_image_path ? (
                          <div
                            className={
                              row.image_path && row.web_image_path ? "grid grid-cols-2 gap-2" : ""
                            }
                          >
                            {([
                              [row.web_image_path, "หน้าเว็บ"],
                              [row.image_path, "สลิปธนาคาร"],
                            ] as const)
                              .filter(([path]) => Boolean(path))
                              .map(([path, label]) => (
                                <div key={label} className="space-y-1">
                                  <span className="dim text-[11px] font-semibold">{label}</span>
                                  {imageUrls[path!] ? (
                                    <a href={imageUrls[path!]} target="_blank" rel="noreferrer">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img
                                        src={imageUrls[path!]}
                                        alt={label}
                                        className="max-h-72 w-full rounded-xl object-contain"
                                        style={{ background: "var(--surface)" }}
                                      />
                                    </a>
                                  ) : (
                                    <Spinner label="กำลังโหลดรูป…" />
                                  )}
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="muted text-xs">ไม่มีรูปแนบ</p>
                        )}

                        <dl className="muted grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div>ที่มา: {OCR_LABEL[row.ocr_status] ?? row.ocr_status}</div>
                          {row.ocr_confidence !== null ? (
                            <div>ความมั่นใจ: {Math.round(Number(row.ocr_confidence) * 100)}%</div>
                          ) : null}
                          {row.ref_no ? <div className="col-span-2">อ้างอิง: {row.ref_no}</div> : null}
                          {row.web_ref_no ? (
                            <div className="col-span-2">รหัสของเว็บ: {row.web_ref_no}</div>
                          ) : null}
                          {row.bank_name || row.account_no || row.account_name ? (
                            <div className="col-span-2">
                              {row.direction === "deposit" ? "บัญชีที่โอนออก" : "บัญชีที่รับเงิน"}:{" "}
                              {[row.bank_name, row.account_no, row.account_name]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          ) : null}
                          {row.counterparty_bank || row.counterparty_account_no || row.counterparty ? (
                            <div className="col-span-2">
                              บัญชีของเว็บ:{" "}
                              {[row.counterparty_bank, row.counterparty_account_no, row.counterparty]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          ) : null}
                          {row.site_url ? <div className="col-span-2">โดเมน: {row.site_url}</div> : null}
                        </dl>

                        {isEditing && editing ? (
                          <div className="space-y-2">
                            <SitePicker
                              sites={sites}
                              value={editing.siteId}
                              onChange={(siteId) => setEditing({ ...editing, siteId })}
                              open={editPickerOpen}
                              onOpenChange={setEditPickerOpen}
                            />
                            <select
                              className="field"
                              value={editing.direction}
                              onChange={(e) =>
                                setEditing({ ...editing, direction: e.target.value as Direction })
                              }
                            >
                              <option value="deposit">เงินเข้าเว็บ</option>
                              <option value="withdraw">เงินออกจากเว็บ</option>
                            </select>
                            <input
                              className="field tabular-nums"
                              inputMode="decimal"
                              value={editing.amount}
                              onChange={(e) => setEditing({ ...editing, amount: e.target.value })}
                            />
                            <input
                              type="datetime-local"
                              className="field"
                              value={editing.occurredAtLocal}
                              onChange={(e) => setEditing({ ...editing, occurredAtLocal: e.target.value })}
                            />
                            <select
                              className="field"
                              value={editing.bankName}
                              onChange={(e) => setEditing({ ...editing, bankName: e.target.value })}
                            >
                              <option value="">
                                {editing.direction === "deposit"
                                  ? "— ธนาคารที่โอนออก —"
                                  : "— ธนาคารที่รับเงิน —"}
                              </option>
                              {bankOptions(editing.bankName).map((name) => (
                                <option key={name} value={name}>
                                  {name}
                                </option>
                              ))}
                            </select>
                            <input
                              className="field"
                              placeholder="โน้ต"
                              value={editing.note}
                              onChange={(e) => setEditing({ ...editing, note: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <button className="btn btn-primary flex-1" onClick={saveEdit} disabled={busy}>
                                บันทึกการแก้ไข
                              </button>
                              <button className="btn btn-ghost" onClick={() => setEditing(null)} disabled={busy}>
                                ยกเลิก
                              </button>
                            </div>
                          </div>
                        ) : row.owner_id === userId ? (
                          <div className="flex gap-2">
                            <button className="btn btn-ghost flex-1" onClick={() => startEdit(row)}>
                              แก้ไข
                            </button>
                            <button className="btn btn-danger" onClick={() => remove(row.id)} disabled={busy}>
                              ลบ
                            </button>
                          </div>
                        ) : (
                          // รายการของคนอื่น — แก้ไม่ได้ (ฝั่ง API ก็กันไว้อีกชั้น) ผู้ดูแลลบได้อย่างเดียว
                          <div className="flex items-center gap-2">
                            <p className="dim flex-1 text-[11.5px]">
                              รายการของ {row.owner?.display_name ?? "คนอื่น"} — แก้ไขไม่ได้
                            </p>
                            {isAdmin ? (
                              <button className="btn btn-danger" onClick={() => remove(row.id)} disabled={busy}>
                                ลบ
                              </button>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
