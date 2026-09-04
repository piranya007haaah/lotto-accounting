"use client";

/**
 * รายงานของ **ขาเดียว** — กดที่ขาในหัวข้อ "แยกตามขา" แล้วกางออกมา
 *
 * ทำไมต้องมี: หน้าพอร์ตตอบได้แค่ "ทั้งพอร์ตทำเงินได้เท่าไหร่" แต่เวลาจะตัดขาทิ้งหรือ
 * เพิ่มเงินแทง คำถามคือ "ขานี้เองเป็นยังไง" — เส้นกำไรของมัน เดือนไหนพัง แพ้ติดกันกี่งวด
 *
 * ⚠️⚠️ index ของ `leg.curve` = **วันปฏิทินนับจาก 1 ม.ค.** (index 0 = ก่อนเริ่ม = 0)
 * ชุดเดียวกับ `equity.values` และ `monthly[].idxStart/idxEnd` เป๊ะ ๆ ⇒ เอาช่วงเดือน
 * ของพอร์ตมาใช้กับเส้นของขาได้ตรง ๆ · **ห้ามนับเป็น "งวดที่"** เพราะวันหยุดก็กินหนึ่ง index
 *
 * ⚠️ เส้นของขาเป็น **กำไรสะสมอ้างอิงที่ 0** ไม่ใช่เส้นทุน ⇒ เส้นอ้างอิงต้องเป็น 0
 * ไม่ใช่ทุนพอร์ต (วางผิดแล้วกราฟจะอ่านว่าขาดทุนตลอดปีทั้งที่กำไร)
 */

import { EquityChart, MonthlyBars } from "@/components/PortfolioCharts";
import { SectionTitle } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { drawdownInSpan } from "@/lib/lottery/portfolio-engine";
import type { PortfolioLeg, PortfolioMonth } from "@/lib/types";
import { monthName } from "./leg-utils";

function Stat({ label, value, sub, tone = "plain" }: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "up" | "down";
}) {
  const color =
    tone === "up" ? "var(--color-money-out)" : tone === "down" ? "var(--color-money-in)" : "var(--text)";
  return (
    <div className="rounded-xl px-2.5 py-2" style={{ background: "var(--accent-tint)" }}>
      <p className="muted text-[10.5px] font-semibold">{label}</p>
      <p className="tnum mt-0.5 text-[14px] font-bold" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="dim mt-0.5 text-[10px] leading-tight">{sub}</p> : null}
    </div>
  );
}

export function LegReport({
  leg,
  months,
  monthDivs,
}: {
  leg: PortfolioLeg;
  /** ช่วงเดือนของพอร์ต — index ชุดเดียวกับ `leg.curve` */
  months: PortfolioMonth[];
  monthDivs: [string, number][];
}) {
  const monthKeys = Object.keys(leg.monthSets);
  const monthly = leg.monthSets ? monthKeys.length > 0 : false;

  // กติกาเดียวกับ `portfolioMonthlyPnl` เป๊ะ ๆ (profit = ปลายช่วง − ต้นช่วง)
  // ต่างกันแค่เส้นที่เอามาวัดเป็นของขา ไม่ใช่ของทั้งพอร์ต
  const legMonths: PortfolioMonth[] =
    leg.curve.length > 1
      ? months.map((month) => ({
          label: month.label,
          capitalStart: leg.curve[Math.min(month.idxStart, leg.curve.length - 1)] ?? 0,
          profit:
            (leg.curve[Math.min(month.idxEnd, leg.curve.length - 1)] ?? 0) -
            (leg.curve[Math.min(month.idxStart, leg.curve.length - 1)] ?? 0),
          maxDd: drawdownInSpan(leg.curve, month.idxStart, month.idxEnd),
          idxStart: month.idxStart,
          idxEnd: month.idxEnd,
        }))
      : [];

  // ⚠️ ROI ต่อเงินหมุนคิดได้เฉพาะขาที่แทงชุดเดียวทั้งปี — ขารายเดือนแทงไม่เท่ากันทุกเดือน
  // และ `nBet` ที่เก็บไว้คือ **เดือนที่แทงเยอะสุด** ⇒ เอามาคูณทั้งปีจะได้เงินหมุนเกินจริง
  const turnover = monthly ? null : leg.nBet * leg.betPerNumber * leg.draws;
  const roiPct = turnover && turnover > 0 ? (leg.profit / turnover) * 100 : null;

  return (
    <div className="space-y-2.5 pb-3">
      <div className="grid grid-cols-3 gap-1.5">
        <Stat
          label="กำไร/ขาดทุน"
          value={formatSigned(leg.profit)}
          sub={roiPct === null ? "แทงไม่เท่ากันทุกเดือน" : `ROI ${roiPct >= 0 ? "+" : ""}${roiPct.toFixed(1)}%`}
          tone={leg.profit >= 0 ? "up" : "down"}
        />
        <Stat
          label="อัตราถูก"
          value={`${leg.winRate.toFixed(1)}%`}
          sub={`${leg.wins}/${leg.draws} งวด`}
        />
        <Stat
          label="ต้นทุน/งวด"
          value={formatBahtShort(leg.nBet * leg.betPerNumber)}
          sub={monthly ? "เดือนที่แทงเยอะสุด" : `${leg.nBet} เลข × ${formatBahtShort(leg.betPerNumber)}`}
        />
        <Stat
          label="แพ้ติดกันสูงสุด"
          value={`${leg.lossStreak} งวด`}
          sub={`ลบช่วงนั้น ${formatSigned(leg.lossStreakAmount)}`}
          tone={leg.lossStreak >= 10 ? "down" : "plain"}
        />
        <Stat
          label="ติดลบลึกสุด"
          value={formatBahtShort(leg.maxRealLoss)}
          sub="ต่ำสุดที่ขานี้เคยติดลบสะสม"
        />
        <Stat
          label="เดือนที่ร่วงหนักสุด"
          value={formatBahtShort(leg.worstMonthDd)}
          sub="ร่วงจากยอดสูงสุดในเดือนนั้น"
        />
      </div>

      {leg.curve.length > 1 ? (
        <div>
          <SectionTitle>กำไรสะสมของขานี้</SectionTitle>
          {/* เส้นอ้างอิง = 0 (จุดคุ้มทุนของขา) ไม่ใช่ทุนพอร์ต — เส้นนี้เป็น "กำไรสะสม" */}
          <EquityChart values={leg.curve} capital={0} monthDivs={monthDivs} />
        </div>
      ) : null}

      {legMonths.length > 0 ? (
        <div>
          <SectionTitle>กำไรรายเดือนของขานี้</SectionTitle>
          <MonthlyBars months={legMonths} startLabel="กำไรสะสมต้นเดือน" startSigned />
        </div>
      ) : null}

      <div>
        <SectionTitle>เลขที่แทง</SectionTitle>
        {monthly ? (
          // ⚠️ เดือนที่ไม่มีคีย์ = **ไม่แทงเดือนนั้น** (ไม่ใช่ใช้เลขทั้งปีแทน) ⇒ ต้องโชว์
          // เป็นรายเดือน ไม่ใช่กองรวมกันจนดูเหมือนแทงชุดเดียวกันหมดทั้งปี
          <div className="space-y-1.5 pt-1">
            {monthKeys
              .map((month) => Number(month))
              .sort((a, b) => a - b)
              .map((month) => (
                <div key={month}>
                  <p className="text-[11.5px] font-semibold">
                    {monthName(month)}{" "}
                    <span className="dim font-normal">
                      {leg.monthSets[String(month)]?.length ?? 0} ตัว
                    </span>
                  </p>
                  <p className="tnum dim text-[10.5px] leading-relaxed break-all">
                    {(leg.monthSets[String(month)] ?? []).join(" ")}
                  </p>
                </div>
              ))}
            <p className="dim text-[10px] leading-relaxed">
              เดือนที่ไม่อยู่ในรายการนี้ = <b>ไม่ได้แทงเดือนนั้น</b> (ต้นทุน 0 · กำไร 0)
            </p>
          </div>
        ) : (
          <p className="tnum dim pt-1 text-[10.5px] leading-relaxed break-all">
            {leg.numbers.join(" ")}
          </p>
        )}
      </div>
    </div>
  );
}
