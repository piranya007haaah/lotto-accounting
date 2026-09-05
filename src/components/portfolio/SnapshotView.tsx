"use client";

/**
 * ส่วน "ผลของพอร์ต" — KPI + กราฟ + รายขา
 *
 * รับ `PortfolioSnapshot` ก้อนเดียว **ไม่สนใจว่ามาจากไหน** (คำนวณสดด้วย `computeSnapshot()`
 * หรือ snapshot เก่าที่ Python ส่งมา) เพราะทั้งสองทางคืนรูปเดียวกันเป๊ะ — คนเรียกเป็นคนบอก
 * ที่มาผ่าน `note` เพื่อไม่ให้ใครเข้าใจผิดว่าเลขนี้สดหรือเก่า
 *
 * ⚠️ สีเขียว/แดงของแอปนี้แยกไม่ออกด้วยตาบอดสีเขียว-แดง ⇒ กำไร/ขาดทุนบอกด้วย
 *    **เครื่องหมาย +/−** และ **ทิศทางของแถบ** เสมอ สีเป็นแค่ของแถม
 */

import { useMemo, useState } from "react";
import { EquityChart, MonthlyBars, ProfitBar } from "@/components/PortfolioCharts";
import { Chip, Modal, SectionTitle } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { comparePositions, minutesOf } from "@/lib/lottery/day-result";
import { prepareReplay } from "@/lib/lottery/day-result";
import type { LotteryPortfolio } from "@/lib/lottery/portfolio-config";
import type { DatasetSequence } from "@/lib/lottery/portfolio-engine";
import type { PortfolioLeg, PortfolioSnapshot } from "@/lib/types";
import { sliceSnapshot, snapshotWindows, worstDayIn } from "@/lib/lottery/snapshot-window";
import { LegMonthTable } from "./LegMonthTable";
import { LegReport } from "./LegReport";

/** ตัวเลขสรุป 1 ช่อง — เล็กกว่า StatCard ของหน้าสรุปยอด เพราะหน้านี้มี 6 ช่อง */
function Kpi({
  label,
  value,
  sub,
  tone = "plain",
  help,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "signed-positive" | "signed-negative" | "warn";
  help?: string;
}) {
  const color =
    tone === "signed-positive"
      ? "var(--color-money-out)"
      : tone === "signed-negative" || tone === "warn"
        ? "var(--color-money-in)"
        : "var(--text)";
  return (
    <div className="card px-3 py-2.5">
      <p className="muted text-[11px] font-semibold">{label}</p>
      <p className="display-num mt-1 text-[17px]" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="dim mt-0.5 text-[10.5px]">{sub}</p> : null}
      {help ? <p className="dim mt-0.5 text-[10px] leading-tight">{help}</p> : null}
    </div>
  );
}

function LegRow({
  leg,
  max,
  onToggle,
}: {
  leg: PortfolioLeg;
  max: number;
  onToggle: () => void;
}) {
  const months = Object.keys(leg.monthSets);
  /**
   * อัตราถูกที่ "เท่าทุน" ของขานี้ = `n_bet / เรตจ่าย` — แทง n เลข ถูกครั้งหนึ่งได้ `เรต`
   * เท่า ⇒ ต่ำกว่านี้คือขาดทุน สูงกว่านี้คือขอบของชุดเลข
   *
   * มีไว้เพราะ "ถูก 65%" อ่านแล้วไม่รู้ว่าดีหรือแย่ถ้าไม่รู้ว่าแทงกี่เลข · ที่เรตเท่าทุน
   * (2 ตัวจ่าย 100 · 3 ตัวจ่าย 1000) การสุ่มล้วนจะได้พอดีเส้นนี้ทุกครั้ง
   * ⚠️ ขาที่ตั้งเลขแยกรายเดือนไม่โชว์ — `nBet` ของมันคือเดือนที่แทงเยอะสุด
   * (worst case ของต้นทุน) ไม่ใช่จำนวนเลขที่แทงจริงทุกงวด เส้นเท่าทุนจะสูงเกินจริง
   */
  const breakEven =
    months.length === 0 && leg.payoutRate > 0 ? (leg.nBet / leg.payoutRate) * 100 : null;
  return (
    // ทั้งแถวกดได้ — บนมือถือปุ่มเล็ก ๆ ท้ายแถวกดพลาดตลอด
    <button type="button" className="row w-full py-2.5 text-left" onClick={onToggle}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
          <span className="dim mr-1 text-[11px]">▸</span>
          {leg.name}
        </span>
        <span
          className="tnum flex-none text-[13px] font-bold"
          style={{ color: leg.profit >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
        >
          {formatSigned(leg.profit)}
        </span>
      </div>
      <div className="mt-1.5">
        <ProfitBar value={leg.profit} max={max} />
      </div>
      <p className="dim mt-1 text-[10.5px]">
        แทง {leg.nBet} เลข × {formatBahtShort(leg.betPerNumber)} บ. · เรต {leg.payoutRate} · ถูก{" "}
        {leg.wins}/{leg.draws} งวด ({leg.winRate.toFixed(1)}%)
        {breakEven !== null ? ` · เท่าทุนที่ ${breakEven.toFixed(1)}%` : ""} · แพ้ติดกัน{" "}
        {leg.lossStreak} งวด
        {months.length > 0 ? ` · ตั้งเลขแยก ${months.length} เดือน` : ""}
        {" · แตะดูรายงานของขานี้"}
      </p>
    </button>
  );
}

export function SnapshotView({
  snapshot,
  showNumbers,
  onToggleNumbers,
  times,
  portfolio,
  sequences,
}: {
  snapshot: PortfolioSnapshot;
  showNumbers: boolean;
  onToggleNumbers: () => void;
  /** {ชื่อหวย: "HH:MM"} — ส่งมาแล้วเรียงขาตามเวลาที่หวยออกจริง แทนการเรียงตามกำไร */
  times?: Record<string, string>;
  /** ส่งมาคู่กันแล้วป๊อปอัปรายขาจะมี **ตารางผลรายวันของเดือน** ต่อท้าย */
  portfolio?: LotteryPortfolio;
  sequences?: readonly DatasetSequence[];
}) {
  /** ขาที่เปิดรายงานอยู่ (`index` ของขา) — ป๊อปอัปทีละขาเดียว */
  const [openLeg, setOpenLeg] = useState<number | null>(null);
  /** ช่วงที่กำลังดู — `null` = ยังไม่ได้กดเลือก ⇒ ตกไปที่ **เดือนล่าสุด** ที่มีข้อมูล */
  const [winKey, setWinKey] = useState<string | null>(null);

  // replay ครั้งเดียวแล้วใช้ซ้ำ — ทั้งการตัดช่วงและป๊อปอัปรายขาต้องใช้ตัวเดียวกัน
  const replay = useMemo(
    () => (portfolio && sequences ? prepareReplay(portfolio, sequences) : undefined),
    [portfolio, sequences],
  );

  const windows = useMemo(() => snapshotWindows(snapshot), [snapshot]);
  /**
   * ดีฟอลต์ = **เดือนล่าสุด** ไม่ใช่ทั้งปี — คำถามที่ถามทุกวันคือ "เดือนนี้เป็นยังไง"
   * (ยอดทั้งปียังกดดูได้ที่ชิป "ทั้งปี") · เปลี่ยนพอร์ตแล้วชิปที่เลือกไว้ไม่มีในพอร์ตใหม่
   * ก็ตกกลับมาที่เดือนล่าสุดเองโดยไม่ต้องล้าง state
   */
  const win = windows.find((item) => item.key === winKey) ?? windows[windows.length - 1];
  const isMonth = win.month != null;

  /** ⚠️ ตัวเลขทุกตัวข้างล่างมาจาก `view` — `snapshot` เต็มปีเหลือใช้แค่บาร์รายเดือน */
  const view = useMemo(() => sliceSnapshot(snapshot, win, replay), [snapshot, win, replay]);
  const kpi = view.kpi;
  const worstDay = useMemo(
    () => (isMonth ? worstDayIn(snapshot, win) : null),
    [isMonth, snapshot, win],
  );
  const yearLabel = snapshot.testYears[snapshot.testYears.length - 1]
    ? `25${snapshot.testYears[snapshot.testYears.length - 1]}`
    : "";
  const scope = isMonth ? `${win.label} ${yearLabel}`.trim() : "ทั้งปี";

  /**
   * ลำดับเดียวกับฟอร์มกรอกผลและการ์ด LINE: เวลาที่หวยออก → หวย → สามบน/สองบน/สองล่าง
   * ไม่ได้ส่ง `times` มา (เช่น snapshot เก่าจาก Python) = เรียงตามกำไรเหมือนเดิม
   */
  const ordered = useMemo(() => {
    const legs = [...view.legs];
    if (!times) return legs.sort((a, b) => b.profit - a.profit);
    const seen: string[] = [];
    for (const leg of legs) {
      if (leg.lottery && !seen.includes(leg.lottery)) seen.push(leg.lottery);
    }
    return legs.sort((a, b) => {
      const la = a.lottery ?? "";
      const lb = b.lottery ?? "";
      if (la !== lb) {
        return (
          minutesOf(times[la] ?? null) - minutesOf(times[lb] ?? null) ||
          seen.indexOf(la) - seen.indexOf(lb)
        );
      }
      return comparePositions(
        { digits: a.digits, position: a.position ?? "" },
        { digits: b.digits, position: b.position ?? "" },
      );
    });
  }, [view.legs, times]);

  const maxLegProfit = Math.max(1, ...ordered.map((leg) => Math.abs(leg.profit)));

  const open = ordered.find((leg) => leg.index === openLeg) ?? null;

  return (
    <>
      {/* ช่วงที่ดู — ดีฟอลต์เดือนล่าสุด ("เดือนนี้เป็นยังไง") กด "ทั้งปี" ได้ยอดรวมแบบเดิม
          ⚠️ ตั้งใจให้ **ตัดบรรทัด** ไม่ใช่แถบเลื่อนแนวนอน — 10-13 ชิปในแถบเลื่อน
             เดือนท้าย ๆ จะซ่อนอยู่นอกจอโดยไม่มีอะไรบอกว่าเลื่อนได้ */}
      {windows.length > 1 ? (
        <div className="flex flex-wrap gap-1.5">
          {windows.map((item) => (
            <Chip
              key={item.key}
              active={item.key === win.key}
              onClick={() => setWinKey(item.key)}
            >
              {item.key === "all" ? "🗓️ ทั้งปี" : item.label}
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Kpi
          label={isMonth ? `กำไร/ขาดทุน · ${win.label}` : "กำไร/ขาดทุน"}
          value={formatSigned(kpi.profit)}
          sub={`${kpi.roiPct >= 0 ? "+" : ""}${kpi.roiPct.toFixed(1)}% ของทุน${isMonth ? "ต้นเดือน" : ""}`}
          tone={kpi.profit >= 0 ? "signed-positive" : "signed-negative"}
        />
        <Kpi
          label={isMonth ? "ทุนต้นเดือน" : "ทุนเริ่มต้น"}
          value={formatBahtShort(kpi.capital)}
          sub={`${view.nLegs} ขา`}
          help={isMonth ? "ทุนที่วิ่งมาถึงต้นเดือนนี้ ไม่ใช่ทุนตั้งต้นของพอร์ต" : undefined}
        />
        <Kpi
          label="ทุนสำรองที่ควรมี"
          value={formatBahtShort(kpi.reserveNeeded)}
          sub={`Max DD ${formatBahtShort(kpi.maxDrawdown)}`}
          help={
            isMonth
              ? "ร่วงจากทุนต้นเดือนลึกสุดในเดือนนี้"
              : "ต้องมีเงินทนเท่านี้ถึงจะไม่ต้องเลิกกลางทาง"
          }
        />
        <Kpi
          label="แพ้ติดกันสูงสุด"
          value={`${kpi.maxLossStreak} งวด`}
          sub={`ลบช่วงนั้น ${formatSigned(kpi.maxLossStreakAmount)}`}
          tone={kpi.maxLossStreak >= 10 ? "warn" : "plain"}
        />
        {/* โหมดเดือน: "เดือนที่ร่วงหนักสุด" ไม่มีความหมาย (มีเดือนเดียว) ⇒ เอาช่องนี้
            มาบอก **วันที่ร่วงหนักสุดวันเดียว** แทน ซึ่งเป็นเลขที่รู้สึกได้จริงตอนเล่น */}
        {isMonth ? (
          <Kpi
            label="วันที่ร่วงหนักสุด"
            value={worstDay ? formatSigned(worstDay.amount) : "—"}
            sub={worstDay?.label || undefined}
            tone={worstDay && worstDay.amount < 0 ? "signed-negative" : "plain"}
            help="ยอดของวันเดียว ไม่ใช่การร่วงสะสม"
          />
        ) : (
          <Kpi
            label="เดือนที่ร่วงหนักสุด"
            value={formatBahtShort(kpi.worstMonthDd)}
            sub={kpi.worstMonthLabel ? `เดือน ${kpi.worstMonthLabel}` : undefined}
            help="ร่วงจากยอดสูงสุดภายในเดือนนั้น — เดือนที่ปิดบวกก็มีช่วงติดลบได้"
          />
        )}
        <Kpi
          label="อัตราถูก"
          value={kpi.draws > 0 ? `${kpi.winRate.toFixed(1)}%` : "—"}
          sub={
            kpi.draws > 0
              ? `${kpi.wins.toLocaleString("th-TH")}/${kpi.draws.toLocaleString("th-TH")} งวด`
              : "ต้องคำนวณสดถึงจะนับรายเดือนได้"
          }
        />
      </div>

      <section className="card px-3.5 py-3">
        <SectionTitle>เส้นทุนรวม · {scope}</SectionTitle>
        <EquityChart
          values={view.equity.values}
          capital={view.equity.capital}
          monthDivs={view.equity.monthDivs}
          months={view.monthly}
        />
      </section>

      {/* บาร์รายเดือนใช้ **ทั้งปีเสมอ** แม้กำลังเจาะเดือนเดียว — มันคือบริบทที่บอกว่า
          เดือนที่กำลังดูดี/แย่กว่าเดือนอื่นแค่ไหน ตัดเหลือแท่งเดียวแล้วไม่เหลือความหมาย */}
      {snapshot.monthly.length > 0 ? (
        <section className="card px-3.5 py-3">
          <SectionTitle>กำไรรายเดือน (ทั้งปี)</SectionTitle>
          <MonthlyBars months={snapshot.monthly} />
        </section>
      ) : null}

      <section className="card px-3.5 py-3">
        <SectionTitle
          action={
            <button type="button" className="dim text-[11.5px] font-semibold" onClick={onToggleNumbers}>
              {showNumbers ? "ซ่อนเลข" : "ดูเลขที่แทง"}
            </button>
          }
        >
          แยกตามขา · {scope}
        </SectionTitle>
        {ordered.map((leg) => (
          <div key={`${leg.index}-${leg.name}`}>
            <LegRow leg={leg} max={maxLegProfit} onToggle={() => setOpenLeg(leg.index)} />
            {showNumbers ? (
              <p className="tnum dim px-0.5 pb-2 text-[10.5px] leading-relaxed break-all">
                {leg.numbers.join(" ")}
              </p>
            ) : null}
          </div>
        ))}
      </section>

      {/* รายงานรายขาเป็น **ป๊อปอัป** ไม่ใช่กางในหน้า — รายงานยาวกว่าหนึ่งจอ กางแล้ว
          รายการขาที่เหลือถูกดันหายไป ต้องเลื่อนหาที่กดต่อ (แบบเดียวกับ st.dialog ของแอปเดิม) */}
      {open ? (
        <Modal
          title={open.name}
          subtitle={`แทง ${open.nBet} เลข × ${formatBahtShort(open.betPerNumber)} บ. · เรต ${open.payoutRate}`}
          onClose={() => setOpenLeg(null)}
        >
          <LegReport leg={open} months={view.monthly} monthDivs={view.equity.monthDivs} />
          {portfolio && sequences ? (
            <LegMonthTable
              portfolio={portfolio}
              sequences={sequences}
              replay={replay}
              leg={open}
              month={win.month ?? undefined}
            />
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
