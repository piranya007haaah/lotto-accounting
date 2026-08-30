"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { SitePicker } from "@/components/SitePicker";
import { Alert, AvatarCircle, SectionTitle, Spinner } from "@/components/ui";
import { formatBahtShort, formatSigned, parseAmountInput } from "@/lib/format";
import { compressImage } from "@/lib/image-client";
import { formatThaiDateTime, toDatetimeLocalValue } from "@/lib/thai-date";
import type { Direction, OcrResult, OcrStatus, SiteRow, SlipQr, SummaryResponse } from "@/lib/types";

const LAST_SITE_KEY = "lotto:lastSiteId";

interface OcrResponse {
  duplicate: {
    id: string;
    amount: number;
    direction: Direction;
    occurredAt: string;
    siteName: string | null;
    /** "image" = ไฟล์เดียวกันเป๊ะ ๆ, "ref" = สลิปใบเดียวกันแต่คนละไฟล์ (ดูจากเลขที่รายการใน QR) */
    reason: "image" | "ref";
  } | null;
  imagePath: string | null;
  imageHash: string | null;
  qr: SlipQr | null;
  ocr: OcrResult | null;
  ocrError: string | null;
}

const DIRECTIONS: Array<{ value: Direction; label: string }> = [
  { value: "deposit", label: "เงินเข้าเว็บ" },
  { value: "withdraw", label: "เงินออกจากเว็บ" },
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
  const [sitePickerOpen, setSitePickerOpen] = useState(false);

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
          <span className="hero-blob" aria-hidden />
          <div className="relative">
            <div className="flex items-baseline justify-between gap-2">
              <p className="muted text-xs font-bold" style={{ letterSpacing: "0.03em" }}>
                สุทธิวันนี้ (กำไร/ขาดทุน)
              </p>
              <span className="text-[11.5px]" style={{ color: "var(--accent)" }}>
                ดูสรุปยอด ›
              </span>
            </div>
            <div className="mt-1 flex items-center gap-3">
              <p className="display-num text-[40px] leading-[1.1]">{formatSigned(today.totals.net)}</p>
              <span
                className="-rotate-6 rounded-[10px] px-2.5 py-1 text-xs font-bold"
                style={
                  today.totals.net >= 0
                    ? { background: "var(--tint-out)", color: "var(--tint-out-text)" }
                    : { background: "var(--tint-in)", color: "var(--color-money-in)" }
                }
              >
                {today.totals.net >= 0 ? "กำไร" : "ขาดทุน"}
              </span>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1">
              <div className="flex items-center gap-1.5">
                <span className="size-[9px] rounded-full" style={{ background: "var(--pastel-in)" }} />
                <span className="muted text-[11.5px]">เข้าเว็บวันนี้</span>
                <span className="tnum text-[14.5px] font-bold" style={{ color: "var(--color-money-in)" }}>
                  {formatBahtShort(today.totals.deposit)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="size-[9px] rounded-full" style={{ background: "var(--pastel-out)" }} />
                <span className="muted text-[11.5px]">ออกจากเว็บวันนี้</span>
                <span className="tnum text-[14.5px] font-bold" style={{ color: "var(--color-money-out)" }}>
                  {formatBahtShort(today.totals.withdraw)}
                </span>
              </div>
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
            <div className="seg">
              {DIRECTIONS.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  className={`seg-item${direction === option.value ? " seg-item-active" : ""}`}
                  onClick={() => setDirection(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="dim mt-1.5 text-[11px]">
              เงินเข้าเว็บ = สลิปโอนเข้าเว็บ · เงินออกจากเว็บ = แคปหน้าถอนสำเร็จ
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="site">
              เว็บ
            </label>
            <SitePicker
              id="site"
              sites={sites}
              value={siteId}
              onChange={setSiteId}
              open={sitePickerOpen}
              onOpenChange={setSitePickerOpen}
              disabled={sites.length === 0}
            />
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
              ) : (
                <Link href="/pairs" className="link-sm">
                  อัปโหลดเป็นคู่ ›
                </Link>
              )
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
              className="dropzone flex flex-col items-center gap-2 px-3 py-7"
            >
              <span
                className="emoji-tile size-[46px] rounded-[14px]"
                style={{ background: "var(--accent-tint)", color: "var(--accent)" }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 3h14v18l-2.5-1.6L14 21l-2-1.6L10 21l-2.5-1.6L5 21z" />
                  <path d="M9 8h6M9 12h6" />
                </svg>
              </span>
              <span className="text-sm font-semibold">เลือกรูปจากเครื่อง / ถ่ายรูป</span>
              <span className="dim text-[11.5px]">
                {ocrEnabled
                  ? "ระบบจะอ่านวันที่และยอดเงินให้อัตโนมัติ"
                  : "ระบบจะอ่านเลขที่รายการจาก QR บนสลิปให้ — ยอดและวันที่กรอกเองด้านล่าง"}
              </span>
            </button>
          )}

          {ocrLoading ? <Spinner label="กำลังอ่านข้อมูลจากรูป…" /> : null}

          {duplicate ? (
            <Alert
              tone="warn"
              title={
                duplicate.reason === "ref"
                  ? "สลิปใบนี้เคยบันทึกไปแล้ว (เลขที่รายการเดียวกัน)"
                  : "สลิปใบนี้เคยบันทึกไปแล้ว"
              }
            >
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
              {ocr.qr ? (
                <Alert tone="success" title="อ่านจาก QR บนสลิปแล้ว">
                  เลขที่รายการ {ocr.qr.transRef}
                  {ocr.qr.sendingBankName ? ` · ${ocr.qr.sendingBankName}` : ""}
                </Alert>
              ) : null}
              {/* ได้มาจาก QR ล้วนก็ไม่มีอะไรให้เตือนเพิ่ม — ที่อ่านจากตัวหนังสือถึงต้องให้ตรวจ */}
              {ocr.sources.some((source) => source !== "qr") ? (
                <Alert tone={ocr.confidence >= 0.7 ? "success" : "warn"}>
                  อ่านข้อมูลจากรูปแล้ว — ตรวจสอบก่อนบันทึกด้วย
                </Alert>
              ) : null}
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
