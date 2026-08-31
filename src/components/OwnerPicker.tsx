"use client";

import { useEffect, useState } from "react";
import { useAuth, type ViewOwner } from "@/components/LiffProvider";
import { AvatarCircle } from "@/components/ui";
import type { MemberOption } from "@/lib/types";

/**
 * เลือกว่ากำลังดูรายการของใคร — ขึ้นเฉพาะคนที่มีสิทธิ์ "เห็นทุกบัญชี"
 *
 * ค่าที่เลือกใช้ร่วมกันทั้งแอป (เก็บไว้ใน context + localStorage) เลือกที่หน้ารายการแล้ว
 * หน้าสรุปยอดเปลี่ยนตาม ไม่ต้องเลือกซ้ำทุกหน้า และการบันทึกยังเป็นของตัวเองเสมอ
 */

/** แผ่นเลือกคน — แยกจากปุ่ม เพื่อให้รูปโปรไฟล์บนหน้าบันทึกเรียกใช้แผ่นเดียวกันได้ */
export function OwnerSheet({
  open,
  onClose,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (owner: ViewOwner | null) => void;
}) {
  const { api, canViewAll, viewOwner } = useAuth();
  const [members, setMembers] = useState<MemberOption[]>([]);

  useEffect(() => {
    if (!open || !canViewAll) return;
    api<{ members: MemberOption[] }>("/api/members")
      .then((data) => setMembers(data.members))
      .catch(() => undefined);
  }, [api, canViewAll, open]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const choose = (owner: ViewOwner | null) => {
    onPick(owner);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-30 flex items-end"
      style={{ background: "rgb(16 25 43 / 0.45)" }}
      onClick={onClose}
    >
      <div
        className="sheet mx-auto flex w-full max-w-md flex-col gap-2 px-2.5 pt-2.5 pb-6"
        style={{ background: "var(--card)", borderRadius: "1.5rem 1.5rem 0 0" }}
        onClick={(event) => event.stopPropagation()}
      >
        <span className="mx-auto h-1 w-10 rounded-full" style={{ background: "var(--line-strong)" }} />
        <p className="px-2 text-[13.5px] font-bold">ดูรายการของใคร</p>

        <ul role="listbox" aria-label="รายชื่อสมาชิก" className="max-h-[58vh] overflow-y-auto">
          <li>
            <button
              type="button"
              role="option"
              aria-selected={viewOwner === null}
              className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left"
              style={{ background: viewOwner === null ? "var(--accent-tint)" : "transparent" }}
              onClick={() => choose(null)}
            >
              <span
                className="emoji-tile size-[34px] text-[15px]"
                style={{ background: "var(--accent-tint)" }}
              >
                👥
              </span>
              <span className="flex-1 text-[14.5px] font-semibold">ทุกคน (รวมกัน)</span>
            </button>
          </li>

          {members.map((member) => {
            const active = viewOwner?.id === member.id;
            const name = member.display_name ?? "(ไม่ทราบชื่อ)";
            return (
              <li key={member.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left"
                  style={{ background: active ? "var(--accent-tint)" : "transparent" }}
                  onClick={() => choose({ id: member.id, name, pictureUrl: member.picture_url })}
                >
                  <AvatarCircle name={name} src={member.picture_url} size={34} />
                  <span className="flex-1 truncate text-[14.5px] font-semibold">{name}</span>
                </button>
              </li>
            );
          })}
        </ul>

        {members.length === 0 ? (
          <p className="dim px-2 pb-1 text-[11.5px]">กำลังโหลดรายชื่อ…</p>
        ) : (
          <p className="dim px-2 pb-1 text-[11.5px]">
            เห็นของคนอื่นได้อย่างเดียว แก้ไขหรือลบได้เฉพาะรายการของตัวเอง
          </p>
        )}
      </div>
    </div>
  );
}

/** ปุ่มเลือกคนแบบเดียวกับตัวเลือกเว็บ — ไม่มีสิทธิ์ข้ามบัญชีก็ไม่ต้องแสดง */
export function OwnerPicker() {
  const { canViewAll, viewOwner, setViewOwner } = useAuth();
  const [open, setOpen] = useState(false);

  if (!canViewAll) return null;

  return (
    <>
      <button
        type="button"
        className="field"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left" }}
      >
        {viewOwner ? (
          <AvatarCircle name={viewOwner.name} src={viewOwner.pictureUrl} size={26} />
        ) : (
          <span className="emoji-tile size-[26px] text-[13px]" style={{ background: "var(--accent-tint)" }}>
            👥
          </span>
        )}
        <span className="flex-1 truncate text-[14.5px] font-semibold">
          {viewOwner ? viewOwner.name : "ทุกคน"}
        </span>
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

      <OwnerSheet open={open} onClose={() => setOpen(false)} onPick={setViewOwner} />
    </>
  );
}
