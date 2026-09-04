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

import { EquityChart, MonthlyBars, ProfitBar } from "@/components/PortfolioCharts";
import { SectionTitle } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import type { PortfolioLeg, PortfolioSnapshot } from "@/lib/types";

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

function LegRow({ leg, max }: { leg: PortfolioLeg; max: number }) {
  const months = Object.keys(leg.monthSets);
  return (
    <div className="row py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-semibold">{leg.name}</span>
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
        {leg.wins}/{leg.draws} งวด ({leg.winRate.toFixed(1)}%) · แพ้ติดกัน {leg.lossStreak} งวด
        {months.length > 0 ? ` · ตั้งเลขแยก ${months.length} เดือน` : ""}
      </p>
    </div>
  );
}

export function SnapshotView({
  snapshot,
  showNumbers,
  onToggleNumbers,
}: {
  snapshot: PortfolioSnapshot;
  showNumbers: boolean;
  onToggleNumbers: () => void;
}) {
  const kpi = snapshot.kpi;
  const legsByProfit = [...snapshot.legs].sort((a, b) => b.profit - a.profit);
  const maxLegProfit = Math.max(1, ...legsByProfit.map((leg) => Math.abs(leg.profit)));

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <Kpi
          label="กำไร/ขาดทุน"
          value={formatSigned(kpi.profit)}
          sub={`${kpi.roiPct >= 0 ? "+" : ""}${kpi.roiPct.toFixed(1)}% ของทุน`}
          tone={kpi.profit >= 0 ? "signed-positive" : "signed-negative"}
        />
        <Kpi label="ทุนเริ่มต้น" value={formatBahtShort(kpi.capital)} sub={`${snapshot.nLegs} ขา`} />
        <Kpi
          label="ทุนสำรองที่ควรมี"
          value={formatBahtShort(kpi.reserveNeeded)}
          sub={`Max DD ${formatBahtShort(kpi.maxDrawdown)}`}
          help="ต้องมีเงินทนเท่านี้ถึงจะไม่ต้องเลิกกลางทาง"
        />
        <Kpi
          label="แพ้ติดกันสูงสุด"
          value={`${kpi.maxLossStreak} งวด`}
          sub={`ลบช่วงนั้น ${formatSigned(kpi.maxLossStreakAmount)}`}
          tone={kpi.maxLossStreak >= 10 ? "warn" : "plain"}
        />
        <Kpi
          label="เดือนที่ร่วงหนักสุด"
          value={formatBahtShort(kpi.worstMonthDd)}
          sub={kpi.worstMonthLabel ? `เดือน ${kpi.worstMonthLabel}` : undefined}
          help="ร่วงจากยอดสูงสุดภายในเดือนนั้น — เดือนที่ปิดบวกก็มีช่วงติดลบได้"
        />
        <Kpi
          label="อัตราถูก"
          value={`${kpi.winRate.toFixed(1)}%`}
          sub={`${kpi.wins.toLocaleString("th-TH")}/${kpi.draws.toLocaleString("th-TH")} งวด`}
        />
      </div>

      <section className="card px-3.5 py-3">
        <SectionTitle>เส้นทุนรวม</SectionTitle>
        <EquityChart
          values={snapshot.equity.values}
          capital={snapshot.equity.capital}
          monthDivs={snapshot.equity.monthDivs}
        />
      </section>

      {snapshot.monthly.length > 0 ? (
        <section className="card px-3.5 py-3">
          <SectionTitle>กำไรรายเดือน</SectionTitle>
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
          แยกตามขา
        </SectionTitle>
        {legsByProfit.map((leg) => (
          <div key={`${leg.index}-${leg.name}`}>
            <LegRow leg={leg} max={maxLegProfit} />
            {showNumbers ? (
              <p className="tnum dim px-0.5 pb-2 text-[10.5px] leading-relaxed break-all">
                {leg.numbers.join(" ")}
              </p>
            ) : null}
          </div>
        ))}
      </section>
    </>
  );
}
