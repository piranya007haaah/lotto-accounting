"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { SitePicker } from "@/components/SitePicker";
import { Alert, EmptyState, Spinner } from "@/components/ui";
import { formatBahtShort, parseAmountInput } from "@/lib/format";
import { compressImage } from "@/lib/image-client";
import {
  mergePair,
  pairImages,
  resolveSite,
  siteNameFromDomain,
  type DocKind,
  type PairDraft,
  type ReadImage,
} from "@/lib/pairing";
import { formatThaiDateTime } from "@/lib/thai-date";
import type { Direction, OcrStatus, SiteRow } from "@/lib/types";

/**
 * อัปโหลด "ภาพหน้าเว็บ + สลิปธนาคาร" เป็นคู่ ทีละหลายคู่ — โหมดหนึ่งของหน้าบันทึกรายการ
 *
 * ระบบอ่านทุกใบ แยกว่าใบไหนเป็นหน้าเว็บใบไหนเป็นสลิป แล้วจับคู่ให้ตามยอดกับเวลา
 * จากนั้นเติมเว็บ บัญชีที่โอนออก/รับเงิน ยอด และวันเวลาให้ครบ เหลือแค่ตรวจแล้วกดบันทึก
 * การจับคู่ทำที่ฝั่งนี้ทั้งหมด สลับคู่ใหม่จึงไม่ต้องอัปโหลดซ้ำ
 */

/** หนึ่งคู่บนจอ — id คงที่ตลอดอายุการแก้ไข จะได้ไม่ทำค่าที่พิมพ์ไว้หาย */
interface Group {
  id: string;
  webId: string | null;
  slipId: string | null;
  guessed: boolean;
}

interface Edit {
  siteId: string;
  direction: Direction;
  amount: string;
  occurredAtLocal: string;
  note: string;
}

type SaveState = { state: "idle" | "saving" | "saved" | "error"; message: string | null };

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: "deposit", label: "เงินเข้าเว็บ" },
  { value: "withdraw", label: "เงินออกจากเว็บ" },
];

const KIND_LABEL: Record<DocKind, string> = { web: "หน้าเว็บ", slip: "สลิปธนาคาร" };

function newId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `g${Date.now()}${Math.random()}`;
}

/** ผู้ใช้แก้ค่าที่อ่านมาหรือยัง — ใช้บอกที่มาของข้อมูลตอนบันทึก */
function resolveOcrStatus(draft: PairDraft, edit: Edit, amount: number): OcrStatus {
  if (draft.amount === null && !draft.occurredAtLocal) return "manual";
  const sameAmount = draft.amount !== null && Math.abs(draft.amount - amount) < 0.005;
  const sameDate = draft.occurredAtLocal === edit.occurredAtLocal;
  return sameAmount && sameDate ? "ocr" : "ocr_edited";
}

export function PairUploader({ onSaved }: { onSaved?: () => void }) {
  const { api, ocrEnabled } = useAuth();

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [images, setImages] = useState<ReadImage[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [saves, setSaves] = useState<Record<string, SaveState>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});

  const [autoAdded, setAutoAdded] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingMigration, setPendingMigration] = useState(false);
  const [savingAll, setSavingAll] = useState(false);
  const [openPicker, setOpenPicker] = useState<string | null>(null);

  const batchInputRef = useRef<HTMLInputElement>(null);
  const slotInputRef = useRef<HTMLInputElement>(null);
  const slotTarget = useRef<{ groupId: string; kind: DocKind } | null>(null);
  const previewsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    api<{ sites: SiteRow[] }>("/api/sites")
      .then((data) => setSites(data.sites))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "โหลดรายชื่อเว็บไม่สำเร็จ"));
  }, [api]);

  useEffect(() => {
    previewsRef.current = previews;
  }, [previews]);

  useEffect(() => {
    return () => {
      for (const url of Object.values(previewsRef.current)) URL.revokeObjectURL(url);
    };
  }, []);

  const imageById = new Map(images.map((image) => [image.id, image]));

  const draftOf = useCallback(
    (group: Group, direction?: Direction): PairDraft =>
      mergePair({
        web: group.webId ? (imageById.get(group.webId) ?? null) : null,
        slip: group.slipId ? (imageById.get(group.slipId) ?? null) : null,
        guessed: group.guessed,
        direction,
      }),
    // imageById สร้างใหม่ทุกรอบ render อยู่แล้ว — ผูกกับ images พอ
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [images],
  );

  /** ค่าเริ่มต้นของฟอร์มหนึ่งคู่ — เอาจากที่อ่านได้ แล้วเลือกเว็บที่ตรงกับโดเมนให้เลย */
  const initialEdit = useCallback(
    (draft: PairDraft, siteList: SiteRow[]): Edit => ({
      siteId: resolveSite(siteList, { domain: draft.siteUrl, siteHint: null })?.id ?? "",
      direction: draft.direction,
      amount: draft.amount === null ? "" : String(draft.amount),
      occurredAtLocal: draft.occurredAtLocal ?? "",
      note: "",
    }),
    [],
  );

  /**
   * เว็บที่อ่านโดเมนได้แต่ยังไม่มีในรายชื่อ — สร้างให้เลย จะได้ไม่ต้องมากรอกเอง
   * ชื่อเว็บตั้งจากโดเมน (chokddd365.run → chokddd365) เปลี่ยนทีหลังได้ที่หน้าจัดการเว็บ
   */
  const ensureSites = useCallback(
    async (domains: Array<string | null>) => {
      const wanted = [...new Set(domains.filter((domain): domain is string => Boolean(domain)))];
      if (wanted.length === 0) return;

      let current = sites;
      const created: string[] = [];

      for (const domain of wanted) {
        if (resolveSite(current, { domain, siteHint: null })) continue;
        const name = siteNameFromDomain(domain);
        if (!name) continue;
        try {
          const data = await api<{ site: SiteRow }>("/api/sites", {
            method: "POST",
            body: JSON.stringify({ name, domain }),
          });
          current = [...current, data.site];
          created.push(data.site.name);
        } catch {
          // ชื่อหรือโดเมนซ้ำกับที่คนอื่นเพิ่งเพิ่ม — โหลดรายชื่อใหม่แล้วใช้ของเดิม
          const reloaded = await api<{ sites: SiteRow[] }>("/api/sites").catch(() => null);
          if (reloaded) current = reloaded.sites;
        }
      }

      setSites(current);
      if (created.length > 0) setAutoAdded((previous) => [...new Set([...previous, ...created])]);
    },
    [api, sites],
  );

  /** อ่านรูปทีละใบ (คำขอละใบ เพื่อให้เห็นความคืบหน้าและไม่ชนลิมิตขนาด body) */
  async function readOne(file: File, kind?: DocKind): Promise<ReadImage> {
    const prepared = await compressImage(file);
    const form = new FormData();
    form.append("file", prepared);
    if (kind) form.append("kind", kind);
    const result = await api<{ image: Omit<ReadImage, "order"> }>("/api/pairs", {
      method: "POST",
      body: form,
    });
    const url = URL.createObjectURL(prepared);
    setPreviews((current) => ({ ...current, [result.image.id]: url }));
    return { ...result.image, order: 0 };
  }

  async function handleBatch(event: React.ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = "";
    if (files.length === 0) return;

    setError(null);
    setProgress({ done: 0, total: files.length });
    const added: ReadImage[] = [];

    for (const file of files) {
      try {
        const image = await readOne(file);
        added.push({ ...image, order: images.length + added.length });
      } catch (caught) {
        setError(
          `${file.name}: ${caught instanceof Error ? caught.message : "อ่านรูปไม่สำเร็จ"}`,
        );
      }
      setProgress((current) => (current ? { ...current, done: current.done + 1 } : current));
    }

    setProgress(null);
    if (added.length > 0) {
      absorb(added);
      await ensureSites(added.map((image) => image.web?.domain ?? null));
    }
  }

  /**
   * เอารูปที่เพิ่งอ่านมาเข้าคู่
   * คู่ที่ครบสองใบแล้วไม่ยุ่ง — จับเฉพาะรูปใหม่กับรูปที่ยังโดดอยู่ จะได้ไม่ล้างที่พิมพ์ไว้
   */
  function absorb(added: ReadImage[]) {
    setImages((current) => [...current, ...added]);
    setGroups((current) => {
      const complete = current.filter((group) => group.webId && group.slipId);
      const singles = current.filter((group) => !group.webId || !group.slipId);
      const pool = [
        ...singles
          .map((group) => group.webId ?? group.slipId)
          .map((id) => [...images, ...added].find((image) => image.id === id))
          .filter((image): image is ReadImage => Boolean(image)),
        ...added,
      ];

      const paired = pairImages(pool).map<Group>((pair) => ({
        id: newId(),
        webId: pair.web?.id ?? null,
        slipId: pair.slip?.id ?? null,
        guessed: pair.guessed,
      }));

      return [...complete, ...paired];
    });
  }

  async function handleSlotFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const target = slotTarget.current;
    event.target.value = "";
    if (!file || !target) return;

    setError(null);
    setProgress({ done: 0, total: 1 });
    try {
      const image = { ...(await readOne(file, target.kind)), order: images.length };
      setImages((current) => [...current, image]);
      await ensureSites([image.web?.domain ?? null]);
      setGroups((current) =>
        current.map((group) =>
          group.id === target.groupId
            ? { ...group, guessed: false, [target.kind === "web" ? "webId" : "slipId"]: image.id }
            : group,
        ),
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "อ่านรูปไม่สำเร็จ");
    } finally {
      setProgress(null);
    }
  }

  function pickSlot(groupId: string, kind: DocKind) {
    slotTarget.current = { groupId, kind };
    slotInputRef.current?.click();
  }

  /** แยกคู่ออกเป็นสองรายการเดี่ยว — จับผิดใบก็แก้ได้โดยไม่ต้องอัปโหลดใหม่ */
  function unpair(group: Group) {
    setGroups((current) => {
      const next: Group[] = [];
      for (const item of current) {
        if (item.id !== group.id) {
          next.push(item);
          continue;
        }
        if (item.webId) next.push({ id: newId(), webId: item.webId, slipId: null, guessed: false });
        if (item.slipId) next.push({ id: newId(), webId: null, slipId: item.slipId, guessed: false });
      }
      return next;
    });
  }

  /** รวมรายการเดี่ยวสองอันเข้าเป็นคู่เดียว */
  function pairManually(group: Group, otherId: string) {
    setGroups((current) => {
      const other = current.find((item) => item.id === otherId);
      if (!other) return current;
      const merged: Group = {
        id: newId(),
        webId: group.webId ?? other.webId,
        slipId: group.slipId ?? other.slipId,
        guessed: false,
      };
      return current.flatMap((item) =>
        item.id === group.id ? [merged] : item.id === otherId ? [] : [item],
      );
    });
  }

  function removeGroup(group: Group) {
    setGroups((current) => current.filter((item) => item.id !== group.id));
    setImages((current) =>
      current.filter((image) => image.id !== group.webId && image.id !== group.slipId),
    );
  }

  function clearAll() {
    setGroups([]);
    setImages([]);
    setEdits({});
    setSaves({});
    setAutoAdded([]);
    for (const url of Object.values(previews)) URL.revokeObjectURL(url);
    setPreviews({});
  }

  /** สร้างเว็บใหม่จากโดเมนที่อ่านได้ แล้วเลือกให้ทุกคู่ที่มาจากโดเมนเดียวกัน */
  async function createSiteFromDomain(domain: string) {
    const name = siteNameFromDomain(domain);
    if (!name) return;
    setError(null);
    try {
      const data = await api<{ site: SiteRow }>("/api/sites", {
        method: "POST",
        body: JSON.stringify({ name, domain }),
      });
      const nextSites = [...sites, data.site];
      setSites(nextSites);
      setEdits((current) => {
        const next = { ...current };
        for (const group of groups) {
          const draft = draftOf(group);
          if (draft.siteUrl !== domain) continue;
          const edit = next[group.id] ?? initialEdit(draft, nextSites);
          next[group.id] = { ...edit, siteId: data.site.id };
        }
        return next;
      });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เพิ่มเว็บไม่สำเร็จ");
    }
  }

  async function saveGroup(group: Group, edit: Edit, draft: PairDraft): Promise<boolean> {
    const amount = parseAmountInput(edit.amount);
    if (!edit.siteId) {
      setSaves((c) => ({ ...c, [group.id]: { state: "error", message: "ยังไม่ได้เลือกเว็บ" } }));
      return false;
    }
    if (amount === null) {
      setSaves((c) => ({ ...c, [group.id]: { state: "error", message: "ยอดเงินไม่ถูกต้อง" } }));
      return false;
    }
    if (!edit.occurredAtLocal) {
      setSaves((c) => ({ ...c, [group.id]: { state: "error", message: "ยังไม่ได้เลือกวันที่และเวลา" } }));
      return false;
    }

    setSaves((c) => ({ ...c, [group.id]: { state: "saving", message: null } }));
    try {
      const result = await api<{ id: string; pendingMigration?: boolean }>("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          siteId: edit.siteId,
          direction: edit.direction,
          amount,
          occurredAtLocal: edit.occurredAtLocal,
          note: edit.note || null,
          refNo: draft.refNo,
          bankName: draft.bankName,
          counterparty: draft.counterparty,
          imagePath: draft.slip?.imagePath ?? null,
          imageHash: draft.slip?.imageHash ?? draft.web?.imageHash ?? null,
          webImagePath: draft.web?.imagePath ?? null,
          webRefNo: draft.webRefNo,
          siteUrl: draft.siteUrl,
          accountNo: draft.accountNo,
          accountName: draft.accountName,
          counterpartyBank: draft.counterpartyBank,
          counterpartyAccountNo: draft.counterpartyAccountNo,
          ocrStatus: resolveOcrStatus(draft, edit, amount),
          ocrConfidence: draft.ocrConfidence,
          ocrRaw: { web: draft.web?.web ?? null, slip: draft.slip?.slip?.raw ?? null },
        }),
      });
      if (result.pendingMigration) setPendingMigration(true);
      setSaves((c) => ({ ...c, [group.id]: { state: "saved", message: null } }));
      onSaved?.();
      return true;
    } catch (caught) {
      setSaves((c) => ({
        ...c,
        [group.id]: {
          state: "error",
          message: caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ",
        },
      }));
      return false;
    }
  }

  async function saveAll() {
    setSavingAll(true);
    setError(null);
    for (const group of groups) {
      if (saves[group.id]?.state === "saved") continue;
      const edit = edits[group.id] ?? initialEdit(draftOf(group), sites);
      // ประเภทที่ผู้ใช้เลือกเป็นตัวตัดสินว่าบัญชีฝั่งไหนเป็นของเรา จึงต้องรวมค่าใหม่ตามนั้น
      const draft = draftOf(group, edit.direction);
      if (draft.duplicate) continue;
      await saveGroup(group, edit, draft);
    }
    setSavingAll(false);
  }

  // รายการที่ยังบันทึกได้จริง — ที่บันทึกไปแล้วและที่ซ้ำกับของเดิมไม่นับ
  const pending = groups.filter(
    (group) => saves[group.id]?.state !== "saved" && !draftOf(group).duplicate,
  );
  const savedCount = groups.filter((group) => saves[group.id]?.state === "saved").length;

  return (
    <div className="space-y-3.5">
      <input
        ref={batchInputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleBatch}
      />
      <input
        ref={slotInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleSlotFile}
      />

      <div className="card space-y-3 p-4">
        <button
          type="button"
          onClick={() => batchInputRef.current?.click()}
          disabled={progress !== null}
          className="dropzone flex flex-col items-center gap-2 px-3 py-6"
        >
          <span
            className="emoji-tile size-[46px] rounded-[14px] text-[20px]"
            style={{ background: "var(--accent-tint)" }}
          >
            🧾
          </span>
          <span className="text-sm font-semibold">เลือกรูปทั้งหมดทีเดียว</span>
          <span className="dim text-center text-[11.5px]">
            เลือกภาพหน้าเว็บกับสลิปพร้อมกันได้เลย กี่คู่ก็ได้ — ระบบจับคู่ให้ตามยอดเงินและเวลา
          </span>
        </button>

        {!ocrEnabled ? (
          <Alert tone="warn" title="ยังไม่ได้ตั้งค่า Google Vision">
            หน้าเว็บไม่มี QR ให้ถอด ระบบจึงอ่านชื่อเว็บและเลขบัญชีจากภาพไม่ได้ — ต้องกรอกเอง
          </Alert>
        ) : null}

        {autoAdded.length > 0 ? (
          <Alert tone="info" title="เพิ่มเว็บให้อัตโนมัติจากโดเมนบนภาพ">
            {autoAdded.join(" · ")} — เปลี่ยนชื่อหรืออิโมจิได้ที่หน้าจัดการเว็บ
          </Alert>
        ) : null}

        {progress ? <Spinner label={`กำลังอ่านรูป ${progress.done}/${progress.total}…`} /> : null}
        {error ? <Alert tone="error">{error}</Alert> : null}
        {pendingMigration ? (
          <Alert tone="warn" title="ฐานข้อมูลยังไม่มีช่องเก็บภาพหน้าเว็บ">
            บันทึกยอดให้แล้ว แต่ภาพหน้าเว็บกับเลขบัญชียังไม่ได้เก็บ — รัน
            <code> supabase/migrations/0007_slip_pairs.sql</code> ก่อน
          </Alert>
        ) : null}
      </div>

      {groups.length === 0 && progress === null ? (
        <EmptyState>ยังไม่มีรูป — กดปุ่มด้านบนเพื่อเลือกภาพหน้าเว็บกับสลิป</EmptyState>
      ) : null}

      {groups.map((group, index) => {
        const edit = edits[group.id] ?? initialEdit(draftOf(group), sites);
        const draft = draftOf(group, edit.direction);
        const save = saves[group.id] ?? { state: "idle" as const, message: null };
        const setEdit = (patch: Partial<Edit>) =>
          setEdits((current) => ({ ...current, [group.id]: { ...edit, ...patch } }));

        // รายการเดี่ยวอีกฝั่งที่เอามาจับคู่ด้วยได้
        const mates = groups.filter(
          (other) =>
            other.id !== group.id &&
            saves[other.id]?.state !== "saved" &&
            ((group.webId && !group.slipId && other.slipId && !other.webId) ||
              (group.slipId && !group.webId && other.webId && !other.slipId)),
        );

        const locked = save.state === "saved" || save.state === "saving";

        return (
          <section key={group.id} className="card space-y-3 p-3.5">
            <div className="flex items-center justify-between gap-2">
              <span className="card-title">คู่ที่ {index + 1}</span>
              {save.state === "saved" ? (
                <span className="text-[12px] font-bold" style={{ color: "var(--color-money-out)" }}>
                  ✓ บันทึกแล้ว
                </span>
              ) : save.state === "saving" ? (
                <Spinner />
              ) : (
                <button type="button" className="link-sm" onClick={() => removeGroup(group)}>
                  ลบคู่นี้
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {(["web", "slip"] as const).map((kind) => {
                const image = kind === "web" ? draft.web : draft.slip;
                const url = image ? previews[image.id] : null;
                return (
                  <div key={kind} className="space-y-1">
                    <span className="dim text-[11px] font-semibold">{KIND_LABEL[kind]}</span>
                    {image ? (
                      <div
                        className="overflow-hidden rounded-xl"
                        style={{ background: "var(--surface)" }}
                      >
                        {url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt={KIND_LABEL[kind]} className="h-36 w-full object-contain" />
                        ) : (
                          <div className="flex h-36 items-center justify-center">
                            <span className="dim text-[11px]">{image.fileName}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => pickSlot(group.id, kind)}
                        className="dropzone flex h-36 w-full flex-col items-center justify-center gap-1"
                      >
                        <span className="text-[20px]">＋</span>
                        <span className="dim text-[11px]">เพิ่ม{KIND_LABEL[kind]}</span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {draft.web && draft.slip && !locked ? (
              <button type="button" className="link-sm" onClick={() => unpair(group)}>
                แยกคู่นี้ออกจากกัน
              </button>
            ) : null}

            {mates.length > 0 && !locked ? (
              <select
                className="field"
                value=""
                onChange={(event) => event.target.value && pairManually(group, event.target.value)}
              >
                <option value="">จับคู่กับรายการอื่น…</option>
                {mates.map((mate) => {
                  const mateDraft = draftOf(mate);
                  const mateIndex = groups.findIndex((item) => item.id === mate.id) + 1;
                  return (
                    <option key={mate.id} value={mate.id}>
                      คู่ที่ {mateIndex} · {mateDraft.amount ? formatBahtShort(mateDraft.amount) : "ไม่รู้ยอด"}{" "}
                      · {mateDraft.web ? "หน้าเว็บ" : "สลิป"}
                    </option>
                  );
                })}
              </select>
            ) : null}

            {draft.warnings.map((warning) => (
              <Alert key={warning} tone="warn">
                {warning}
              </Alert>
            ))}

            {draft.duplicate ? (
              <Alert tone="warn" title="เคยบันทึกไปแล้ว">
                {formatBahtShort(draft.duplicate.amount)} บาท ·{" "}
                {draft.duplicate.direction === "deposit" ? "เข้าเว็บ" : "ออกจากเว็บ"}
                {draft.duplicate.siteName ? ` · ${draft.duplicate.siteName}` : ""}
                <br />
                {formatThaiDateTime(draft.duplicate.occurredAt)}
              </Alert>
            ) : null}

            <div>
              <span className="field-label">เว็บ</span>
              <SitePicker
                sites={sites}
                value={edit.siteId}
                onChange={(siteId) => setEdit({ siteId })}
                open={openPicker === group.id}
                onOpenChange={(open) => setOpenPicker(open ? group.id : null)}
                disabled={locked || sites.length === 0}
              />
              {!edit.siteId && draft.siteUrl ? (
                <button
                  type="button"
                  className="link-sm mt-1.5 inline-block"
                  onClick={() => createSiteFromDomain(draft.siteUrl!)}
                >
                  ＋ เพิ่มเว็บ “{siteNameFromDomain(draft.siteUrl)}” จาก {draft.siteUrl}
                </button>
              ) : null}
            </div>

            <div className="seg">
              {DIRECTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  disabled={locked}
                  className={`seg-item${edit.direction === option.value ? " seg-item-active" : ""}`}
                  onClick={() => setEdit({ direction: option.value })}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="field-label">ยอดเงิน</span>
                <input
                  className="field tabular-nums font-semibold"
                  inputMode="decimal"
                  placeholder="0.00"
                  disabled={locked}
                  value={edit.amount}
                  onChange={(event) => setEdit({ amount: event.target.value })}
                />
              </div>
              <div>
                <span className="field-label">วันที่และเวลา</span>
                <input
                  type="datetime-local"
                  className="field"
                  disabled={locked}
                  value={edit.occurredAtLocal}
                  onChange={(event) => setEdit({ occurredAtLocal: event.target.value })}
                />
              </div>
            </div>

            <dl className="muted grid grid-cols-1 gap-y-1 text-[11.5px]">
              {draft.bankName || draft.accountNo || draft.accountName ? (
                <div>
                  {edit.direction === "deposit" ? "บัญชีที่โอนออก" : "บัญชีที่รับเงิน"} (ของเรา):{" "}
                  {[draft.bankName, draft.accountNo, draft.accountName].filter(Boolean).join(" · ")}
                </div>
              ) : null}
              {draft.counterpartyBank || draft.counterpartyAccountNo || draft.counterparty ? (
                <div>
                  บัญชีของเว็บ:{" "}
                  {[draft.counterpartyBank, draft.counterpartyAccountNo, draft.counterparty]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              ) : null}
              {draft.refNo ? <div>เลขที่รายการบนสลิป: {draft.refNo}</div> : null}
              {draft.webRefNo ? <div>รหัสรายการของเว็บ: {draft.webRefNo}</div> : null}
            </dl>

            {!locked ? (
              <input
                className="field"
                placeholder="โน้ต (ไม่บังคับ)"
                value={edit.note}
                onChange={(event) => setEdit({ note: event.target.value })}
              />
            ) : null}

            {save.state === "error" && save.message ? <Alert tone="error">{save.message}</Alert> : null}

            {!locked ? (
              <button
                type="button"
                className="btn btn-ghost w-full"
                disabled={savingAll || Boolean(draft.duplicate)}
                onClick={() => saveGroup(group, edit, draft)}
              >
                บันทึกเฉพาะคู่นี้
              </button>
            ) : null}
          </section>
        );
      })}

      {groups.length > 0 ? (
        <div className="space-y-2">
          <button
            type="button"
            className="btn btn-primary w-full"
            disabled={savingAll || progress !== null || pending.length === 0}
            onClick={saveAll}
          >
            {savingAll ? "กำลังบันทึก…" : `บันทึกทั้งหมด (${pending.length} รายการ)`}
          </button>
          <div className="flex items-center justify-between">
            <span className="dim text-[11.5px]">
              {savedCount > 0 ? `บันทึกแล้ว ${savedCount} รายการ` : ""}
            </span>
            <button type="button" className="link-sm" onClick={clearAll} disabled={savingAll}>
              ล้างทั้งหมด
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
