"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, EmptyState, PageHeader, SiteBadge, Spinner } from "@/components/ui";
import { formatBahtShort, parseAmountInput } from "@/lib/format";
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
  note: string;
}

const OCR_LABEL: Record<string, string> = {
  ocr: "อ่านจากรูป",
  ocr_edited: "อ่านจากรูป + แก้",
  manual: "กรอกเอง",
  failed: "อ่านรูปไม่ออก",
};

export default function HistoryPage() {
  const { api, canViewAll} = useAuth();

  const [month, setMonth] = useState(() => currentMonthKey());
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

  useEffect(() => {
    api<{ sites: SiteRow[] }>("/api/sites?all=1")
      .then((data) => setSites(data.sites))
      .catch(() => undefined);
  }, [api]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ month });
      if (siteFilter) query.set("siteId", siteFilter);
      if (directionFilter) query.set("direction", directionFilter);
      const data = await api<{ transactions: TransactionWithSite[] }>(`/api/transactions?${query}`);
      setRows(data.transactions);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายการไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api, month, siteFilter, directionFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleOpen(row: TransactionWithSite) {
    const next = openId === row.id ? null : row.id;
    setOpenId(next);
    setEditing(null);
    if (next && row.image_path && !imageUrls[row.id]) {
      try {
        const data = await api<{ url: string }>(`/api/images?path=${encodeURIComponent(row.image_path)}`);
        setImageUrls((current) => ({ ...current, [row.id]: data.url }));
      } catch {
        /* ดูรูปไม่ได้ก็ยังดูข้อมูลอื่นได้ */
      }
    }
  }

  function startEdit(row: TransactionWithSite) {
    setEditing({
      id: row.id,
      siteId: row.site_id,
      direction: row.direction,
      amount: String(row.amount),
      occurredAtLocal: toDatetimeLocalValue(new Date(row.occurred_at)),
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

  return (
    <div className="space-y-3.5">
      <PageHeader title="รายการทั้งหมด" subtitle={`${rows.length} รายการในเดือนที่เลือก`} />

      <div className="card space-y-2 p-3">
        <input type="month" className="field" value={month} onChange={(e) => setMonth(e.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <select className="field" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
            <option value="">ทุกเว็บ</option>
            {sites.map((site) => (
              <option key={site.id} value={site.id}>
                {site.name}
              </option>
            ))}
          </select>
          <select className="field" value={directionFilter} onChange={(e) => setDirectionFilter(e.target.value)}>
            <option value="">เข้า + ออก</option>
            <option value="deposit">เงินเข้าเว็บ</option>
            <option value="withdraw">เงินออกจากเว็บ</option>
          </select>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <Spinner label="กำลังโหลด…" /> : null}
      {!loading && rows.length === 0 ? <EmptyState>ยังไม่มีรายการในเดือนนี้</EmptyState> : null}

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

            <ul className="divide-y" style={{ borderColor: "var(--divider)" }}>
              {items.map((row) => {
                const parts = zonedParts(new Date(row.occurred_at));
                const isOpen = openId === row.id;
                const isEditing = editing?.id === row.id;

                return (
                  <li key={row.id}>
                    <button
                      onClick={() => toggleOpen(row)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left"
                    >
                      <span className="dim tnum w-10 flex-none text-xs">
                        {pad2(parts.hour)}:{pad2(parts.minute)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <SiteBadge name={row.site?.name ?? "—"} color={row.site?.color} />
                        {canViewAll ? (
                          <span className="dim block truncate text-[11px]">
                            👤 {row.owner?.display_name ?? "(ไม่ทราบชื่อ)"}
                          </span>
                        ) : null}
                        {row.note ? <span className="dim block truncate text-[11px]">{row.note}</span> : null}
                      </span>
                      <span
                        className="tnum flex-none text-sm font-bold"
                        style={{
                          color: row.direction === "deposit" ? "var(--color-money-in)" : "var(--color-money-out)",
                        }}
                      >
                        {row.direction === "deposit" ? "−" : "+"}
                        {formatBahtShort(row.amount)}
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="space-y-3 px-4 pb-4">
                        {imageUrls[row.id] ? (
                          <a href={imageUrls[row.id]} target="_blank" rel="noreferrer">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageUrls[row.id]}
                              alt="สลิป"
                              className="max-h-72 w-full rounded-xl object-contain"
                              style={{ background: "var(--surface)" }}
                            />
                          </a>
                        ) : row.image_path ? (
                          <Spinner label="กำลังโหลดรูป…" />
                        ) : (
                          <p className="muted text-xs">ไม่มีรูปแนบ</p>
                        )}

                        <dl className="muted grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                          <div>ที่มา: {OCR_LABEL[row.ocr_status] ?? row.ocr_status}</div>
                          {row.ocr_confidence !== null ? (
                            <div>ความมั่นใจ: {Math.round(Number(row.ocr_confidence) * 100)}%</div>
                          ) : null}
                          {row.ref_no ? <div className="col-span-2">อ้างอิง: {row.ref_no}</div> : null}
                          {row.bank_name ? <div className="col-span-2">ธนาคาร: {row.bank_name}</div> : null}
                        </dl>

                        {isEditing && editing ? (
                          <div className="space-y-2">
                            <select
                              className="field"
                              value={editing.siteId}
                              onChange={(e) => setEditing({ ...editing, siteId: e.target.value })}
                            >
                              {sites.map((site) => (
                                <option key={site.id} value={site.id}>
                                  {site.name}
                                </option>
                              ))}
                            </select>
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
                        ) : (
                          <div className="flex gap-2">
                            <button className="btn btn-ghost flex-1" onClick={() => startEdit(row)}>
                              แก้ไข
                            </button>
                            <button className="btn btn-danger" onClick={() => remove(row.id)} disabled={busy}>
                              ลบ
                            </button>
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
