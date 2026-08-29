"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import type { SiteRow } from "@/lib/types";

/** โทน pastel ให้เข้ากับธีม — เว็บเก่าที่เก็บสีเข้มไว้ยังแสดงได้ตามปกติ */
const COLORS = ["#9dbff9", "#f19a9e", "#8fd6b1", "#f5c48b", "#c3abf7", "#8fd3e2", "#f4a6c8", "#c3dc8f"];

const EMOJIS = ["🎰", "🍀", "💎", "🐉", "🧧", "🔥", "⭐", "🎲"];

/** กล่อง emoji ประจำเว็บ บนพื้นสี pastel ของเว็บนั้น */
function SiteEmojiTile({ emoji, color, faded }: { emoji: string; color: string | null; faded?: boolean }) {
  return (
    <span
      className="emoji-tile size-8 rounded-[11px] text-base"
      style={{
        background: `color-mix(in srgb, ${color ?? "var(--accent)"} 38%, var(--card))`,
        opacity: faded ? 0.45 : 1,
      }}
    >
      {emoji}
    </span>
  );
}

export default function SitesPage() {
  const { api } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [emoji, setEmoji] = useState<string | null>(null);

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
        body: JSON.stringify({ name: name.trim(), color, emoji }),
      });
      setSites((current) => [...current, data.site]);
      setName("");
      setEmoji(null);
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
    <div className="space-y-3.5">
      <PageHeader title="จัดการเว็บ" subtitle="รายชื่อที่จะขึ้นใน dropdown ตอนบันทึกรายการ" />

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
        <div>
          <span className="field-label">สีประจำเว็บ</span>
          <div className="flex flex-wrap gap-2.5">
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
        </div>
        <div>
          <span className="field-label">emoji ประจำเว็บ (ไม่บังคับ — กดซ้ำเพื่อเอาออก)</span>
          <div className="flex flex-wrap gap-2">
            {EMOJIS.map((value) => {
              const active = emoji === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEmoji(active ? null : value)}
                  aria-label={`เลือก emoji ${value}`}
                  aria-pressed={active}
                  className="emoji-tile size-[34px] rounded-xl text-[17px]"
                  style={{
                    background: active ? "var(--accent-tint)" : "var(--field-bg)",
                    border: active ? "1px solid transparent" : "1px solid var(--field-line)",
                    outline: active ? "2px solid var(--ink-btn)" : "none",
                    outlineOffset: 1,
                  }}
                >
                  {value}
                </button>
              );
            })}
          </div>
        </div>
        <button className="btn btn-primary w-full" disabled={busy || !name.trim()}>
          เพิ่มเว็บ
        </button>
      </form>

      {loading ? <Spinner label="กำลังโหลด…" /> : null}

      {mine.length > 0 ? (
        <section className="card p-4">
          <SectionTitle>เว็บของฉัน</SectionTitle>
          <ul>
            {mine.map((site) => (
              <li key={site.id} className="row flex items-center gap-3 py-2">
                {site.emoji ? (
                  <SiteEmojiTile emoji={site.emoji} color={site.color} faded={!site.is_active} />
                ) : (
                  <span
                    className="size-3 shrink-0 rounded-full"
                    style={{ background: site.color ?? "#9ca3af", opacity: site.is_active ? 1 : 0.45 }}
                  />
                )}
                <span className={`flex-1 truncate text-sm font-semibold ${site.is_active ? "" : "line-through opacity-50"}`}>
                  {site.name}
                </span>
                <button className="muted text-xs underline" onClick={() => toggleActive(site)} disabled={busy}>
                  {site.is_active ? "ปิดใช้" : "เปิดใช้"}
                </button>
                <button
                  className="text-xs underline"
                  style={{ color: "var(--color-money-in)" }}
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
            <ul>
              {shared.map((site) => (
                <li key={site.id} className="row flex items-center gap-3 py-2">
                  {site.emoji ? (
                    <SiteEmojiTile emoji={site.emoji} color={site.color} />
                  ) : (
                    <span className="size-3 shrink-0 rounded-full" style={{ background: site.color ?? "#9ca3af" }} />
                  )}
                  <span className="flex-1 truncate text-sm font-semibold">{site.name}</span>
                  <span
                    className="rounded-full px-2.5 py-1 text-[11px] font-bold"
                    style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
                  >
                    ทุกคนเห็น
                  </span>
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
