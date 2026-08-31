"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, AvatarCircle, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import type { MemberRow } from "@/lib/types";

function formatWhen(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function MemberCard({
  member,
  busy,
  onPatch,
}: {
  member: MemberRow;
  busy: boolean;
  onPatch: (member: MemberRow, patch: { isActive?: boolean; canViewAll?: boolean }) => void;
}) {
  return (
    <li className="card flex items-center gap-3 p-3">
      <AvatarCircle name={member.display_name} src={member.picture_url} size={40} />

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{member.display_name ?? "(ไม่มีชื่อ)"}</p>
        <p className="dim truncate text-xs">
          {member.is_admin
            ? "ผู้ดูแลระบบ"
            : member.is_active
              ? `อนุมัติเมื่อ ${formatWhen(member.approved_at)}`
              : `เข้ามาเมื่อ ${formatWhen(member.created_at)}`}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1.5">
        {member.is_admin ? (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
          >
            ผู้ดูแล
          </span>
        ) : (
          <button
            className={`btn ${member.is_active ? "" : "btn-primary"}`}
            disabled={busy}
            onClick={() => onPatch(member, { isActive: !member.is_active })}
          >
            {member.is_active ? "ถอนสิทธิ์" : "อนุมัติ"}
          </button>
        )}

        {/* ผู้ดูแลเห็นทุกบัญชีอยู่แล้ว ปุ่มนี้จึงไม่มีผล — ไม่ต้องขึ้นให้รก */}
        {member.is_active && !member.is_admin ? (
          <button
            className="rounded-full border px-2.5 py-1 text-xs font-semibold"
            disabled={busy}
            onClick={() => onPatch(member, { canViewAll: !member.can_view_all })}
            style={
              member.can_view_all
                ? { background: "var(--tint-out)", borderColor: "#bee5d2", color: "var(--tint-out-text)" }
                : { background: "transparent", borderColor: "var(--line-strong)", color: "var(--muted)" }
            }
          >
            {member.can_view_all ? "เห็นทุกบัญชี" : "เห็นเฉพาะของตัวเอง"}
          </button>
        ) : null}
      </div>
    </li>
  );
}

export default function AdminPage() {
  const { api, isAdmin } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api<{ members: MemberRow[] }>("/api/admin/members");
      setMembers(data.members);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดรายชื่อสมาชิกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void load();
    else setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function patchMember(member: MemberRow, patch: { isActive?: boolean; canViewAll?: boolean }) {
    setBusyId(member.id);
    setError(null);
    try {
      const data = await api<{ member: MemberRow }>(`/api/admin/members/${member.id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
      setMembers((current) => current.map((m) => (m.id === member.id ? data.member : m)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เปลี่ยนสิทธิ์ไม่สำเร็จ");
    } finally {
      setBusyId(null);
    }
  }

  if (!isAdmin) {
    return (
      <Alert tone="warn" title="เข้าหน้านี้ไม่ได้">
        หน้านี้สำหรับผู้ดูแลระบบเท่านั้น
      </Alert>
    );
  }

  if (loading) return <Spinner label="กำลังโหลดรายชื่อสมาชิก…" />;

  const pending = members.filter((m) => !m.is_active);
  const active = members.filter((m) => m.is_active);

  return (
    <div className="space-y-3.5">
      <PageHeader title="สมาชิก" subtitle="อนุมัติเพื่อนที่เข้ามาใหม่ หรือถอนสิทธิ์ได้ที่นี่" />

      {error ? <Alert tone="error">{error}</Alert> : null}

      <section>
        <SectionTitle
          action={
            pending.length > 0 ? (
              <span
                className="tnum rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: "#fff3e0", color: "#c77700" }}
              >
                {pending.length}
              </span>
            ) : null
          }
        >
          รออนุมัติ
        </SectionTitle>
        {pending.length === 0 ? (
          <EmptyState>ไม่มีใครรออนุมัติ</EmptyState>
        ) : (
          <ul className="space-y-2">
            {pending.map((m) => (
              <MemberCard key={m.id} member={m} busy={busyId === m.id} onPatch={patchMember} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <SectionTitle>ใช้งานได้ ({active.length})</SectionTitle>
        <ul className="space-y-2">
          {active.map((m) => (
            <MemberCard key={m.id} member={m} busy={busyId === m.id} onPatch={patchMember} />
          ))}
        </ul>
      </section>

      <div className="muted space-y-1 text-xs">
        <p>
          <b>อนุมัติ</b> = เข้าใช้งานได้ · <b>ถอนสิทธิ์</b> = เข้าไม่ได้อีก (ข้อมูลเดิมไม่ถูกลบ)
        </p>
        <p>
          <b>เห็นเฉพาะของตัวเอง</b> คือค่าเริ่มต้น — บัญชีแยกขาดจากกัน ไม่ปนกัน
        </p>
        <p>
          <b>เห็นทุกบัญชี</b> = ดูรายการและสรุปยอดรวมของทุกคนได้ แต่ <b>แก้หรือลบของคนอื่นไม่ได้</b>{" "}
          และรายการที่บันทึกใหม่ยังเข้าบัญชีตัวเองเสมอ
        </p>
        <p>ผู้ดูแลกำหนดจาก <code>LINE_ADMIN_USER_IDS</code> ในการตั้งค่าเซิร์ฟเวอร์เท่านั้น</p>
      </div>
    </div>
  );
}
