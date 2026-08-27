"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, AvatarCircle, SectionTitle, Spinner } from "@/components/ui";
import { formatBahtShort, formatSigned, parseAmountInput } from "@/lib/format";
import { compressImage } from "@/lib/image-client";
import { formatThaiDateTime, toDatetimeLocalValue } from "@/lib/thai-date";
import type { Direction, OcrResult, OcrStatus, SiteRow, SummaryResponse } from "@/lib/types";

const LAST_SITE_KEY = "lotto:lastSiteId";

interface OcrResponse {
  duplicate: {
    id: string;
    amount: number;
    direction: Direction;
    occurredAt: string;
    siteName: string | null;
  } | null;
  imagePath: string | null;
  imageHash: string | null;
  ocr: OcrResult | null;
  ocrError: string | null;
}

const DIRECTIONS: Array<{ value: Direction; label: string; hint: string; color: string }> = [
  { value: "deposit", label: "เงินเข้าเว็บ", hint: "สลิปโอนเข้าเว็บ", color: "var(--color-money-in)" },
  { value: "withdraw", label: "เงินออกจากเว็บ", hint: "แคปหน้าถอนสำเร็จ", color: "var(--color-money-out)" },
];

export default function EntryPage() {
  const { api, ocrEnabled, profile } = useAuth();

  const [sites, setSites] = useState<SiteRow[]>([]);
  const [today, setToday] = useState<SummaryResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [direction, setDirection] = useState<Direction>("deposit");
  const [siteId, setSiteId] = useState("");
  const [amount, setAmount] = useState("");
  const [occurredAtLocal, setOccurredAtLocal] = useState(() => toDatetimeLocalValue(new Date()));
  const [refNo, setRefNo] = useState("");
  const [bankName, setBankName] = useState("");
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(false);

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [ocr, setOcr] = useState<OcrResult | null>(null);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [duplicate, setDuplicate] = useState<OcrResponse["duplicate"]>(null);

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadToday = useCallback(async () => {
    try {
      const summary = await api<SummaryResponse & { label: string }>("/api/summary?range=today");
      setToday(summary);
    } catch {
      /* ยอดวันนี้โหลดไม่ได้ก็ไม่เป็นไร ไม่ควรบล็อกการบันทึก */
    }
  }, [api]);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<{ sites: SiteRow[] }>("/api/sites");
        setSites(data.sites);
        const remembered = typeof window !== "undefined" ? localStorage.getItem(LAST_SITE_KEY) : null;
        const fallback = data.sites[0]?.id ?? "";
        setSiteId(data.sites.some((s) => s.id === remembered) ? remembered! : fallback);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "โหลดรายชื่อเว็บไม่สำเร็จ");
      }
    })();
    void loadToday();
  }, [api, loadToday]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function clearImage() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setImagePath(null);
    setImageHash(null);
    setOcr(null);
    setOcrError(null);
    setDuplicate(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setFormError(null);
    setSaved(null);
    setDuplicate(null);
    setOcr(null);
    setOcrError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setOcrLoading(true);

    try {
      const prepared = await compressImage(file);
      const form = new FormData();
      form.append("file", prepared);
      const result = await api<OcrResponse>("/api/ocr", { method: "POST", body: form });

      if (result.duplicate) {
        setDuplicate(result.duplicate);
        setImagePath(null);
        setImageHash(result.imageHash);
        return;
      }

      setImagePath(result.imagePath);
      setImageHash(result.imageHash);
      setOcrError(result.ocrError);

      if (result.ocr) {
        setOcr(result.ocr);
        if (result.ocr.amount !== null) setAmount(String(result.ocr.amount));
        if (result.ocr.occurredAtLocal) setOccurredAtLocal(result.ocr.occurredAtLocal);
        if (result.ocr.refNo) setRefNo(result.ocr.refNo);
        if (result.ocr.bankName) setBankName(result.ocr.bankName);
        if (result.ocr.direction) setDirection(result.ocr.direction);

        // ถ้าเห็นชื่อเว็บบนภาพและตรงกับรายการที่มี ให้เลือกให้เลย
        const hint = result.ocr.siteHint?.toLowerCase();
        if (hint) {
          const matched = sites.find(
            (site) => hint.includes(site.name.toLowerCase()) || site.name.toLowerCase().includes(hint),
          );
          if (matched) setSiteId(matched.id);
        }
      }
    } catch (error) {
      setOcrError(error instanceof Error ? error.message : "อ่านรูปไม่สำเร็จ");
    } finally {
      setOcrLoading(false);
    }
  }

  function resolveOcrStatus(amountValue: number): OcrStatus {
    if (!imagePath) return "manual";
    if (!ocr) return "failed";
    const sameAmount = ocr.amount !== null && Math.abs(ocr.amount - amountValue) < 0.005;
    const sameDate = ocr.occurredAtLocal === occurredAtLocal;
    return sameAmount && sameDate ? "ocr" : "ocr_edited";
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setFormError(null);
    setSaved(null);

    const amountValue = parseAmountInput(amount);
    if (!siteId) return setFormError("กรุณาเลือกเว็บ");
    if (amountValue === null) return setFormError("กรุณากรอกยอดเงินให้ถูกต้อง");
    if (!occurredAtLocal) return setFormError("กรุณาเลือกวันที่และเวลา");

    setSaving(true);
    try {
      await api("/api/transactions", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          direction,
          amount: amountValue,
          occurredAtLocal,
          refNo: refNo || null,
          bankName: bankName || null,
          note: note || null,
          imagePath,
          imageHash,
          ocrStatus: resolveOcrStatus(amountValue),
          ocrConfidence: ocr?.confidence ?? null,
          ocrRaw: ocr?.raw ?? null,
        }),
      });

      localStorage.setItem(LAST_SITE_KEY, siteId);
      setSaved(
        `บันทึกแล้ว ${formatBahtShort(amountValue)} บาท (${direction === "deposit" ? "เข้าเว็บ" : "ออกจากเว็บ"})`,
      );
      setAmount("");
      setRefNo("");
      setBankName("");
      setNote("");
      setOccurredAtLocal(toDatetimeLocalValue(new Date()));
      clearImage();
      void loadToday();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  const directionMismatch = ocr?.direction && ocr.direction !== direction;

  return (
    <div className="space-y-3.5">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="page-title">บันทึกรายการ</h1>
          <p className="page-sub truncate">สวัสดี {profile?.displayName ?? "ผู้ใช้"}</p>
        </div>
        <AvatarCircle name={profile?.displayName} src={profile?.pictureUrl} />
      </header>

      {today ? (
        <Link href="/summary" className="hero">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-xs font-medium" style={{ color: "var(--color-brand-200)" }}>
              สุทธิวันนี้ (กำไร/ขาดทุน)
            </p>
            <span className="text-[11px]" style={{ color: "var(--color-brand-200)" }}>
              ดูสรุปยอด ›
            </span>
          </div>
          <p
            className="tnum mt-0.5 mb-3 text-[30px] leading-tight font-bold"
            style={{ color: today.totals.net < 0 ? "var(--on-dark-in)" : "var(--on-dark-out)" }}
          >
            {formatSigned(today.totals.net)}
          </p>
          <div className="flex gap-6">
            <div>
              <p className="text-[11px]" style={{ color: "var(--color-brand-200)" }}>
                เข้าเว็บวันนี้
              </p>
              <p className="tnum mt-px text-[15px] font-semibold" style={{ color: "var(--on-dark-in)" }}>
                {formatBahtShort(today.totals.deposit)}
              </p>
            </div>
            <div>
              <p className="text-[11px]" style={{ color: "var(--color-brand-200)" }}>
                ออกจากเว็บวันนี้
              </p>
              <p className="tnum mt-px text-[15px] font-semibold" style={{ color: "var(--on-dark-out)" }}>
                {formatBahtShort(today.totals.withdraw)}
              </p>
            </div>
          </div>
        </Link>
      ) : null}

      {loadError ? <Alert tone="error">{loadError}</Alert> : null}
      {saved ? <Alert tone="success">✓ {saved}</Alert> : null}

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className="card p-4 space-y-4">
          <div>
            <span className="field-label">ประเภทรายการ</span>
            <div className="grid grid-cols-2 gap-2">
              {DIRECTIONS.map((option) => {
                const active = direction === option.value;
                return (
                  <button
                    type="button"
                    key={option.value}
                    onClick={() => setDirection(option.value)}
                    className="rounded-xl px-3 py-2.5 text-left"
                    style={{
                      border: "1.5px solid",
                      borderColor: active ? option.color : "var(--line-strong)",
                      background: active ? "color-mix(in srgb, " + option.color + " 10%, transparent)" : "transparent",
                    }}
                  >
                    <span
                      className="block text-sm font-semibold"
                      style={{ color: active ? option.color : "var(--text)" }}
                    >
                      {option.label}
                    </span>
                    <span className="dim block text-[11px]">{option.hint}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="site">
              เว็บ
            </label>
            <select
              id="site"
              className="field"
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
            >
              {sites.length === 0 ? <option value="">— ยังไม่มีเว็บ —</option> : null}
              {sites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
            <Link href="/sites" className="link-sm mt-[7px] inline-block">
              เพิ่ม / แก้ไขรายชื่อเว็บ
            </Link>
          </div>
        </div>

        <div className="card p-4 space-y-3">
          <SectionTitle
            action={
              previewUrl ? (
                <button type="button" className="link-sm" onClick={clearImage}>
                  ลบรูป
                </button>
              ) : null
            }
          >
            รูปสลิป / หน้าจอถอนเงิน
          </SectionTitle>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handleFile}
          />

          {previewUrl ? (
            <button type="button" onClick={() => fileInputRef.current?.click()} className="block w-full">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="รูปที่เลือก"
                className="max-h-64 w-full rounded-xl object-contain"
                style={{ background: "var(--surface)" }}
              />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="dropzone flex flex-col items-center gap-1 px-3 py-7"
            >
              <span className="text-2xl">🧾</span>
              <span className="text-sm font-semibold">เลือกรูปจากเครื่อง / ถ่ายรูป</span>
              <span className="dim text-[11.5px]">
                {ocrEnabled ? "ระบบจะอ่านวันที่และยอดเงินให้อัตโนมัติ" : "กรอกยอดและวันที่เองด้านล่าง"}
              </span>
            </button>
          )}

          {ocrLoading ? <Spinner label="กำลังอ่านข้อมูลจากรูป…" /> : null}

          {duplicate ? (
            <Alert tone="warn" title="สลิปใบนี้เคยบันทึกไปแล้ว">
              {formatBahtShort(duplicate.amount)} บาท ·{" "}
              {duplicate.direction === "deposit" ? "เข้าเว็บ" : "ออกจากเว็บ"}
              {duplicate.siteName ? ` · ${duplicate.siteName}` : ""}
              <br />
              {formatThaiDateTime(duplicate.occurredAt)}
              <br />
              <Link href="/history" className="underline">
                ดูในรายการทั้งหมด
              </Link>
            </Alert>
          ) : null}

          {ocrError ? <Alert tone="warn" title="อ่านรูปอัตโนมัติไม่ได้">{ocrError}</Alert> : null}

          {ocr ? (
            <div className="space-y-2">
              <Alert tone={ocr.confidence >= 0.7 ? "success" : "warn"}>
                อ่านข้อมูลจากรูปแล้ว (ความมั่นใจ {Math.round(ocr.confidence * 100)}%) — ตรวจสอบก่อนบันทึกด้วย
              </Alert>
              {ocr.warnings.map((warning) => (
                <Alert key={warning} tone="warn">
                  {warning}
                </Alert>
              ))}
              {directionMismatch ? (
                <Alert tone="warn">
                  ระบบอ่านว่ารูปนี้น่าจะเป็น
                  {ocr.direction === "deposit" ? " เงินเข้าเว็บ " : " เงินออกจากเว็บ "}
                  แต่คุณเลือกอีกแบบ — ตรวจอีกครั้งนะ
                </Alert>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="card p-4 space-y-4">
          <div>
            <label className="field-label" htmlFor="amount">
              ยอดเงิน (บาท)
            </label>
            <input
              id="amount"
              className="field text-lg font-semibold tabular-nums"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          <div>
            <label className="field-label" htmlFor="occurredAt">
              วันที่และเวลา
            </label>
            <input
              id="occurredAt"
              type="datetime-local"
              className="field"
              value={occurredAtLocal}
              onChange={(event) => setOccurredAtLocal(event.target.value)}
            />
          </div>

          <button
            type="button"
            className="muted text-xs underline"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? "ซ่อนรายละเอียดเพิ่มเติม" : "รายละเอียดเพิ่มเติม (เลขอ้างอิง, ธนาคาร, โน้ต)"}
          </button>

          {showDetails ? (
            <div className="space-y-3">
              <div>
                <label className="field-label" htmlFor="refNo">
                  เลขอ้างอิง
                </label>
                <input id="refNo" className="field" value={refNo} onChange={(e) => setRefNo(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="bankName">
                  ธนาคาร
                </label>
                <input id="bankName" className="field" value={bankName} onChange={(e) => setBankName(e.target.value)} />
              </div>
              <div>
                <label className="field-label" htmlFor="note">
                  โน้ต
                </label>
                <textarea id="note" className="field" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            </div>
          ) : null}
        </div>

        {formError ? <Alert tone="error">{formError}</Alert> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={saving || ocrLoading}>
          {saving ? "กำลังบันทึก…" : "บันทึกรายการ"}
        </button>
      </form>
    </div>
  );
}
