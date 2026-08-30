"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { PairUploader } from "@/components/PairUploader";
import { AvatarCircle } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import type { Direction, SummaryResponse } from "@/lib/types";

/**
 * หน้าบันทึกรายการ — มีสองแท็บตามทิศทางของเงินเท่านั้น
 * ที่เหลือทำในตัวอัปโหลดเดียวกันหมด: แนบภาพหน้าเว็บคู่กับสลิป ทีละหลายคู่ก็ได้
 * แนบรูปเดียวก็ได้ หรือจะกรอกเองโดยไม่มีรูปเลยก็ได้
 */

const DIRECTIONS: Array<{ value: Direction; label: string; hint: string }> = [
  {
    value: "deposit",
    label: "เงินเข้าเว็บ",
    hint: "แนบภาพหน้าฝากของเว็บคู่กับสลิปโอนเงิน — ระบบเติมเว็บและบัญชีที่โอนออกให้",
  },
  {
    value: "withdraw",
    label: "เงินออกจากเว็บ",
    hint: "แนบภาพหน้าถอนของเว็บคู่กับสลิปเงินเข้าบัญชี — ระบบเติมเว็บและบัญชีที่รับเงินให้",
  },
];

export default function EntryPage() {
  const { api, profile } = useAuth();

  const [direction, setDirection] = useState<Direction>("deposit");
  const [today, setToday] = useState<SummaryResponse | null>(null);

  const loadToday = useCallback(async () => {
    try {
      const summary = await api<SummaryResponse & { label: string }>("/api/summary?range=today");
      setToday(summary);
    } catch {
      /* ยอดวันนี้โหลดไม่ได้ก็ไม่เป็นไร ไม่ควรบล็อกการบันทึก */
    }
  }, [api]);

  useEffect(() => {
    void loadToday();
  }, [loadToday]);

  const active = DIRECTIONS.find((option) => option.value === direction)!;

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

      <div>
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
        <p className="dim mt-1.5 text-[11px]">{active.hint}</p>
      </div>

      <PairUploader direction={direction} onSaved={loadToday} />
    </div>
  );
}
