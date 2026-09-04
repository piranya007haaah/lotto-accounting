"use client";

/**
 * พอร์ตหวย — กราฟสำคัญของพอร์ตที่ใช้จริง (ข้อมูลมาจากแอป Streamlit)
 *
 * ⚠️ หน้านี้ **ไม่คำนวณอะไรเลย** — ตัวเลขทุกตัวมาจาก engine backtest ฝั่ง Python
 * ที่ส่ง snapshot เข้ามาทาง /api/portfolio/snapshot ⇒ ถ้าเลขดูแปลก ให้ไปดูฝั่งโน้น
 * (คำนวณซ้ำที่นี่ = สองแอปโชว์คนละเลขโดยไม่มีใครรู้)
 *
 * เห็นได้เฉพาะผู้ดูแล — พอร์ตเป็นเงินของเจ้าของคนเดียว ไม่ใช่ข้อมูลร่วมแบบรายชื่อเว็บ
 */

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { EquityChart, MonthlyBars, ProfitBar } from "@/components/PortfolioCharts";
import { Alert, Chip, EmptyState, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import type { PortfolioLeg, PortfolioSnapshot } from "@/lib/types";

interface PortfolioListItem {
  portfolioId: number;
  name: string;
  isActive: boolean;
  generatedAt: string;
}

interface SnapshotResponse {
  portfolios: PortfolioListItem[];
  snapshot: PortfolioSnapshot | null;
}

/** "31 ส.ค. 2569 14:20" จาก ISO ที่ฝั่ง Python ส่งมา (เวลาไทยติดมาแล้ว) */
function thaiDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

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

export default function PortfolioPage() {
  const { api, canViewLottery } = useAuth();
  const [data, setData] = useState<SnapshotResponse | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = selected === null ? "" : `?id=${selected}`;
      setData(await api<SnapshotResponse>(`/api/portfolio/snapshot${query}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "โหลดข้อมูลพอร์ตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, [api, selected]);

  useEffect(() => {
    if (canViewLottery) void load();
    else setLoading(false);
  }, [canViewLottery, load]);

  if (!canViewLottery) {
    return (
      <div className="space-y-3.5">
        <PageHeader title="พอร์ต" />
        <Alert tone="warn">หน้านี้เปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต</Alert>
      </div>
    );
  }

  const snapshot = data?.snapshot ?? null;
  const kpi = snapshot?.kpi;
  const legsByProfit = [...(snapshot?.legs ?? [])].sort((a, b) => b.profit - a.profit);
  const maxLegProfit = Math.max(1, ...legsByProfit.map((leg) => Math.abs(leg.profit)));

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="พอร์ต"
        subtitle={
          snapshot
            ? `${snapshot.name} · ${snapshot.nLegs} ขา · ข้อมูลถึง ${snapshot.asOf || "—"}`
            : "ผลย้อนหลังจากแอปหวย"
        }
      />

      {(data?.portfolios.length ?? 0) > 1 ? (
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {data?.portfolios.map((item) => (
            <Chip
              key={item.portfolioId}
              active={(selected ?? data.portfolios[0]?.portfolioId) === item.portfolioId}
              onClick={() => setSelected(item.portfolioId)}
            >
              {item.isActive ? `★ ${item.name}` : item.name}
            </Chip>
          ))}
        </div>
      ) : null}

      {loading ? <Spinner label="กำลังโหลด..." /> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}

      {!loading && !error && !snapshot ? (
        <div className="card px-4 py-5">
          <EmptyState>ยังไม่มีข้อมูลพอร์ต</EmptyState>
          <p className="muted text-center text-[12px] leading-relaxed">
            ข้อมูลมาจากแอปหวย (Streamlit) — เปิดหน้า <b>📝 กรอกผลส่งไลน์</b> แล้วเปิด
            <b> “อัปเดตพอร์ตในแอปบัญชีด้วย”</b> ตอนบันทึกผล หรือรัน
            <br />
            <code className="text-[11px]">python3 scripts/export_portfolio_snapshot.py --post</code>
          </p>
        </div>
      ) : null}

      {snapshot && kpi ? (
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
                <button
                  type="button"
                  className="dim text-[11.5px] font-semibold"
                  onClick={() => setShowNumbers((value) => !value)}
                >
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

          <p className="dim px-1 pb-1 text-center text-[10.5px] leading-relaxed">
            ผลย้อนหลังปี test {snapshot.testYears.join("+") || "—"} · คำนวณจากแอปหวยเมื่อ{" "}
            {thaiDateTime(snapshot.generatedAt)}
            <br />
            ตัวเลขทั้งหมดเป็นผลย้อนหลัง ไม่ใช่การรับประกันผลในอนาคต
          </p>
        </>
      ) : null}
    </div>
  );
}
