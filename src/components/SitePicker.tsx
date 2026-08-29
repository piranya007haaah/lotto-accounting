"use client";

import { useEffect } from "react";
import { siteTint } from "@/components/ui";
import type { SiteRow } from "@/lib/types";

/**
 * ตัวเลือกเว็บที่โชว์สีและอิโมจิประจำเว็บ
 * — ใช้แทน <select> เพราะ option ของระบบกำหนดสีไม่ได้ (โดยเฉพาะบน iOS)
 */

/** กล่องสีประจำเว็บ — มีอิโมจิก็ใส่ในกล่อง ไม่มีก็เป็นบล็อกสีทึบ */
function SiteMark({ site, size }: { site: SiteRow | null; size: number }) {
  if (!site) {
    return (
      <span
        className="emoji-tile"
        style={{ width: size, height: size, background: "var(--field-bg)", border: "1px solid var(--field-line)" }}
      />
    );
  }
  return (
    <span
      className="emoji-tile"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.52,
        background: site.emoji ? siteTint(site.color) : (site.color ?? "var(--dim)"),
      }}
    >
      {site.emoji ?? ""}
    </span>
  );
}

export function SitePicker({
  id,
  sites,
  value,
  onChange,
  open,
  onOpenChange,
  /** ใส่เมื่อต้องการตัวเลือก "ทุกเว็บ" (ค่าจะเป็นสตริงว่าง) */
  allLabel,
  disabled,
}: {
  id?: string;
  sites: SiteRow[];
  value: string;
  onChange: (siteId: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  allLabel?: string;
  disabled?: boolean;
}) {
  const selected = sites.find((site) => site.id === value) ?? null;

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    // กันหน้าเลื่อนตามนิ้วตอนแผ่นตัวเลือกเปิดอยู่
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onOpenChange]);

  const label = selected ? selected.name : allLabel ? allLabel : "— ยังไม่มีเว็บ —";

  return (
    <>
      <button
        type="button"
        id={id}
        className="field"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpenChange(true)}
        style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
      >
        <SiteMark site={selected} size={26} />
        <span className="flex-1 truncate text-[14.5px] font-semibold">{label}</span>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--dim)"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-30 flex items-end"
          style={{ background: "rgb(16 25 43 / 0.45)" }}
          onClick={() => onOpenChange(false)}
        >
          <div
            className="sheet mx-auto flex w-full max-w-md flex-col gap-2 px-2.5 pt-2.5 pb-6"
            style={{ background: "var(--card)", borderRadius: "1.5rem 1.5rem 0 0" }}
            onClick={(event) => event.stopPropagation()}
          >
            <span className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--line-strong)" }} />
            <p className="px-2 text-[13.5px] font-bold">เลือกเว็บ</p>

            <ul role="listbox" aria-label="รายชื่อเว็บ" className="max-h-[58vh] overflow-y-auto">
              {allLabel ? (
                <li>
                  <button
                    type="button"
                    role="option"
                    aria-selected={value === ""}
                    className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left"
                    style={{ background: value === "" ? "var(--accent-tint)" : "transparent" }}
                    onClick={() => {
                      onChange("");
                      onOpenChange(false);
                    }}
                  >
                    <SiteMark site={null} size={30} />
                    <span className="flex-1 truncate text-[14.5px] font-semibold">{allLabel}</span>
                  </button>
                </li>
              ) : null}

              {sites.map((site) => {
                const active = site.id === value;
                return (
                  <li key={site.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={active}
                      className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left"
                      style={{ background: active ? "var(--accent-tint)" : "transparent" }}
                      onClick={() => {
                        onChange(site.id);
                        onOpenChange(false);
                      }}
                    >
                      <SiteMark site={site} size={30} />
                      <span
                        className={`flex-1 truncate text-[14.5px] font-semibold ${
                          site.is_active ? "" : "line-through opacity-50"
                        }`}
                      >
                        {site.name}
                      </span>
                      {active ? (
                        <svg
                          width="17"
                          height="17"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="var(--accent)"
                          strokeWidth="2.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M4 12l5 5L20 6" />
                        </svg>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
