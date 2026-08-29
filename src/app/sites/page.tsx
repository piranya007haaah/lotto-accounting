"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, EmptyState, PageHeader, SectionTitle, siteTint, Spinner } from "@/components/ui";
import type { SiteRow } from "@/lib/types";

/** โทน pastel ให้เข้ากับธีม — เว็บเก่าที่เก็บสีเข้มไว้ยังแสดงได้ตามปกติ */
const COLORS = ["#9dbff9", "#f19a9e", "#8fd6b1", "#f5c48b", "#c3abf7", "#8fd3e2", "#f4a6c8", "#c3dc8f"];

/** ตัวอย่างที่กดเลือกได้เร็ว ๆ — พิมพ์เองจากแป้นพิมพ์ก็ได้ ไม่จำกัดแค่นี้ */
const QUICK_EMOJIS = ["🎰", "🍀", "💎", "🐉", "🧧", "🎲"];

/**
 * เก็บอิโมจิไว้ตัวเดียว โดยเอาตัวหลังสุดที่พิมพ์
 * — พิมพ์ทับของเดิมได้เลยโดยไม่ต้องลบก่อน
 */
function oneEmoji(value: string): string {
  const text = value.replace(/\s+/g, "");
  if (!text) return "";
  try {
    // ธง/อิโมจิผสมเป็นหลาย code point ต้องตัดเป็น grapheme ไม่ใช่ตัวอักษร
    const segments = [...new Intl.Segmenter().segment(text)];
    return segments.at(-1)?.segment ?? "";
  } catch {
    // เบราว์เซอร์เก่าที่ไม่มี Intl.Segmenter — ส่งเท่าที่พิมพ์ ให้ server ตัดสินความยาว
    return text.slice(-16);
  }
}

/** ช่องอิโมจิ — แตะแล้วแป้นพิมพ์ขึ้น เลือกอิโมจิอะไรก็ได้ พื้นหลังเป็นสีประจำเว็บ */
function EmojiInput({
  value,
  onChange,
  color,
  ariaLabel,
  size,
}: {
  value: string | null | undefined;
  onChange: (next: string) => void;
  color?: string | null;
  ariaLabel: string;
  size: number;
}) {
  const filled = Boolean(value);
  return (
    <input
      type="text"
      className="emoji-input"
      aria-label={ariaLabel}
      value={value ?? ""}
      placeholder="＋"
      onChange={(event) => onChange(oneEmoji(event.target.value))}
      style={{
        width: size,
        height: size,
        background: siteTint(color),
        border: filled ? "1px solid transparent" : "1px dashed var(--line-strong)",
      }}
    />
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
  const [emoji, setEmoji] = useState("");

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
        body: JSON.stringify({ name: name.trim(), color, emoji: emoji || null }),
      });
      setSites((current) => [...current, data.site]);
      setName("");
      setEmoji("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มเว็บไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  function replaceSite(updated: SiteRow) {
    setSites((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  /** เปลี่ยนทันทีบนจอ แล้วค่อยยิงไปเก็บ — พลาดเมื่อไหร่ค่อยย้อนกลับ */
  async function saveEmoji(site: SiteRow, next: string) {
    const value = next || null;
    if ((site.emoji ?? null) === value) return;
    replaceSite({ ...site, emoji: value });
    setError(null);
    try {
      const data = await api<{ site: SiteRow }>(`/api/sites/${site.id}`, {
        method: "PATCH",
        body: JSON.stringify({ emoji: value }),
      });
      replaceSite(data.site);
    } catch (caught) {
      replaceSite(site);
      setError(caught instanceof Error ? caught.message : "เปลี่ยนอิโมจิไม่สำเร็จ");
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
      replaceSite(data.site);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "แก้ไขไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  }

  async function remove(site: SiteRow) {
    if (!window.confirm(`ลบเว็บ "${site.name}"? ทุกคนจะไม่เห็นเว็บนี้อีก`)) return;
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

  return (
    <div className="space-y-3.5">
      <PageHeader title="จัดการเว็บ" subtitle="ทุกคนใช้รายชื่อเดียวกัน — ใครเพิ่มหรือแก้ ทุกคนเห็นเหมือนกัน" />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <form onSubmit={addSite} className="card space-y-3.5 p-4">
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
                aria-pressed={color === value}
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
          <span className="field-label">อิโมจิประจำเว็บ (ไม่บังคับ)</span>
          <div className="flex items-center gap-3">
            <EmojiInput
              value={emoji}
              onChange={setEmoji}
              color={color}
              ariaLabel="อิโมจิประจำเว็บ"
              size={40}
            />
            <p className="dim text-[11.5px]">แตะช่องนี้แล้วกดปุ่มอิโมจิบนแป้นพิมพ์ เลือกตัวไหนก็ได้</p>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {QUICK_EMOJIS.map((value) => {
              const active = emoji === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setEmoji(active ? "" : value)}
                  aria-label={`เลือกอิโมจิ ${value}`}
                  aria-pressed={active}
                  className="emoji-tile size-[38px] text-[18px]"
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

      {!loading ? (
        <section className="card p-4">
          <SectionTitle>รายชื่อเว็บ ({sites.length})</SectionTitle>
          {sites.length === 0 ? (
            <EmptyState>ยังไม่มีเว็บ — เพิ่มจากช่องด้านบนได้เลย</EmptyState>
          ) : (
            <>
              <ul>
                {sites.map((site) => (
                  <li key={site.id} className="row flex items-center gap-3 py-2">
                    <EmojiInput
                      value={site.emoji}
                      onChange={(next) => saveEmoji(site, next)}
                      color={site.color}
                      ariaLabel={`อิโมจิของ ${site.name}`}
                      size={32}
                    />
                    <span
                      className={`flex-1 truncate text-sm font-semibold ${
                        site.is_active ? "" : "line-through opacity-50"
                      }`}
                    >
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
              <p className="muted mt-2.5 text-[11px]">
                แตะช่องอิโมจิหน้าชื่อเว็บเพื่อเปลี่ยนได้เลย · ปิดใช้ = ยังอยู่ในรายการเก่า แต่ไม่ขึ้นตอนบันทึกใหม่
              </p>
            </>
          )}
        </section>
      ) : null}
    </div>
  );
}
