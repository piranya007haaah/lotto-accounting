"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, EmptyState, SectionTitle, Spinner } from "@/components/ui";
import type { SiteRow } from "@/lib/types";

const COLORS = ["#2563eb", "#dc2626", "#059669", "#d97706", "#7c3aed", "#0891b2", "#db2777", "#65a30d"];

export default function SitesPage() {
  const { api } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ sites: SiteRow[] }>("/api/sites?all=1");
      setSites(data.sites);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายชื่อเว็บไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addSite(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ site: SiteRow }>("/api/sites", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), color }),
      });
      setSites((current) => [...current, data.site]);
      setName("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มเว็บไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(site: SiteRow) {
    setBusy(true);
    setError(null);
    try {
      const data = await api<{ site: SiteRow }>(`/api/sites/${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !site.is_active }),
      });
      setSites((current) => current.map((item) => (item.id === site.id ? data.site : item)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "แก้ไขไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(site: SiteRow) {
    if (!window.confirm(`ลบเว็บ "${site.name}"?`)) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sites/${site.id}`, { method: "DELETE" });
      setSites((current) => current.filter((item) => item.id !== site.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ลบไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  const shared = sites.filter((site) => site.owner_id === null);
  const mine = sites.filter((site) => site.owner_id !== null);

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-bold">จัดการเว็บ</h1>
        <p className="muted text-xs">รายชื่อที่จะขึ้นใน dropdown ตอนบันทึกรายการ</p>
      </header>

      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={addSite} className="card space-y-3 p-4">
        <SectionTitle>เพิ่มเว็บใหม่</SectionTitle>
        <input
          className="field"
          placeholder="ชื่อเว็บ"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
        />
        <div className="flex flex-wrap gap-2">
          {COLORS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setColor(value)}
              aria-label={`เลือกสี ${value}`}
              className="size-7 rounded-full"
              style={{
                background: value,
                outline: color === value ? "2px solid var(--text)" : "none",
                outlineOffset: 2,
              }}
            />
          ))}
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
          เพิ่มเว็บ
        </button>
      </form>

      {loading ? <Spinner label="กำลังโหลด…" /> : null}

      {mine.length > 0 ? (
        <section className="card p-4">
          <SectionTitle>เว็บของฉัน</SectionTitle>
          <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
            {mine.map((site) => (
              <li key={site.id} className="flex items-center gap-3 py-2.5">
                <span className="size-3 shrink-0 rounded-full" style={{ background: site.color ?? "#9ca3af" }} />
                <span className={`flex-1 truncate text-sm ${site.is_active ? "" : "line-through opacity-50"}`}>
                  {site.name}
                </span>
                <button className="muted text-xs underline" onClick={() => toggleActive(site)} disabled={busy}>
                  {site.is_active ? "ปิดใช้" : "เปิดใช้"}
                </button>
                <button
                  className="text-xs text-red-600 underline"
                  onClick={() => remove(site)}
                  disabled={busy}
                >
                  ลบ
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="card p-4">
        <SectionTitle>เว็บกลาง</SectionTitle>
        {shared.length === 0 ? (
          <EmptyState>ยังไม่มีเว็บกลาง</EmptyState>
        ) : (
          <>
            <ul className="divide-y" style={{ borderColor: "var(--line)" }}>
              {shared.map((site) => (
                <li key={site.id} className="flex items-center gap-3 py-2.5">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: site.color ?? "#9ca3af" }} />
                  <span className="flex-1 truncate text-sm">{site.name}</span>
                  <span className="muted text-[11px]">ทุกคนเห็น</span>
                </li>
              ))}
            </ul>
            <p className="muted mt-2 text-[11px]">
              เว็บกลางมาจากไฟล์ seed แก้ไขได้ในฐานข้อมูลโดยตรง
            </p>
          </>
        )}
      </section>
    </div>
  );
}
