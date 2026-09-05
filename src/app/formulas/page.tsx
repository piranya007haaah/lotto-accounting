"use client";

/**
 * เลือกสูตร — "หวยไหนใช้สูตรนี้แล้วกำไรดีสุดในปีนั้น" (ผู้ดูแลเท่านั้น)
 *
 * ย้ายมาจากหน้า `pages/2_🧪_เลือกสูตร.py` ของแอป Streamlit · ต่างจากหน้าพอร์ตตรงที่
 * **หน้านี้คำนวณเอง** ด้วย `src/lib/lottery/*` (พอร์ตรับ snapshot มาวาดอย่างเดียว)
 *
 * แบ่งงานกัน 2 ที่เพื่อให้มือถือไม่ต้องโหลดผลหวยทั้งฐาน:
 * - ตารางอันดับ = `/api/lottery/rank` คำนวณให้ (อ่านทุกหวย ~0.8 MB ที่ฝั่ง server)
 * - รายละเอียดของหวยที่กด = โหลดเฉพาะกลุ่มนั้นมาคำนวณในเบราว์เซอร์ ⇒ เปลี่ยนอันดับ
 *   n_bet แล้วกราฟขยับทันที ไม่ต้องรอเซิร์ฟเวอร์
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { EquityChart, MultiEquityChart, ProfitBar } from "@/components/PortfolioCharts";
import { Alert, Chip, EmptyState, Modal, PageHeader, SectionTitle, Spinner } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";
import { computeRiskMetrics, randomBaseline } from "@/lib/lottery/engine";
import { DEFAULT_FORMULA, FORMULA_NAMES } from "@/lib/lottery/formulas";
import {
  analyzeGroup,
  drawMonthDividers,
  trainYearsOf,
  type GroupAnalysis,
  type RankMode,
  type RankRow,
} from "@/lib/lottery/rank";

interface GroupsResponse {
  groups: { lottery: string; position: string; flag: string; years: string[] }[];
  years: string[];
}

interface RankResponse {
  rows: RankRow[];
}

interface EntriesResponse {
  entries: { lottery: string; position: string; year: string; flag: string; sequence: string }[];
}

const KEY = (lottery: string, position: string) => `${lottery}|${position}`;

/** ช่องกรอกตัวเลขของแถบตั้งค่า — เก็บเป็นข้อความระหว่างพิมพ์ ("" ระหว่างลบเลขไม่เด้งกลับ) */
function NumberField({
  label,
  value,
  onChange,
  min,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  suffix?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <span className="flex items-center gap-1">
        <input
          className="field tabular-nums font-semibold"
          inputMode="numeric"
          value={text}
          onChange={(event) => {
            const next = event.target.value.replace(/[^\d]/g, "");
            setText(next);
            const parsed = Number.parseInt(next, 10);
            if (Number.isFinite(parsed) && parsed >= min) onChange(parsed);
          }}
          onBlur={() => setText(String(value))}
        />
        {suffix ? <span className="dim flex-none text-[11px]">{suffix}</span> : null}
      </span>
    </label>
  );
}

function Kpi({ label, value, sub, tone = "plain" }: {
  label: string;
  value: string;
  sub?: string;
  tone?: "plain" | "up" | "down";
}) {
  const color =
    tone === "up" ? "var(--color-money-out)" : tone === "down" ? "var(--color-money-in)" : "var(--text)";
  return (
    <div className="card px-3 py-2.5">
      <p className="muted text-[11px] font-semibold">{label}</p>
      <p className="display-num mt-1 text-[17px]" style={{ color }}>
        {value}
      </p>
      {sub ? <p className="dim mt-0.5 text-[10.5px]">{sub}</p> : null}
    </div>
  );
}

export default function FormulasPage() {
  const { api, canViewLottery } = useAuth();

  const [years, setYears] = useState<string[]>([]);
  const [formula, setFormula] = useState(DEFAULT_FORMULA);
  const [testYear, setTestYear] = useState("");
  /** ปีที่ใช้เทรน — ลิสต์ว่าง = **ทุกปีก่อน test** (ของเดิม) ไม่ใช่ "ไม่เทรนเลย" */
  const [trainYears, setTrainYears] = useState<string[]>([]);
  const [mode, setMode] = useState<RankMode>("train");
  const [capital, setCapital] = useState(100_000);
  const [bet, setBet] = useState(100);
  const [payout, setPayout] = useState(100);

  const [rows, setRows] = useState<RankRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openKey, setOpenKey] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<GroupAnalysis | null>(null);
  const [chosenRank, setChosenRank] = useState(1);
  /** sequence ของปี test ที่กำลังเปิดดู — ใช้หาเส้นแบ่งเดือน (index = งวดจริง) */
  const [testStr, setTestStr] = useState("");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  /** ผลหวยดิบของกลุ่มที่เคยเปิด — กดสลับไปมาแล้วไม่ต้องโหลดซ้ำ */
  const cache = useRef(new Map<string, EntriesResponse["entries"]>());

  // รายชื่อปีที่มีข้อมูล — ปีล่าสุดเป็นค่าเริ่มต้น (สดที่สุด = ที่คนอยากดู)
  useEffect(() => {
    if (!canViewLottery) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        // `digits=2` — สูตรในหน้านี้เป็นสูตร 2 ตัวล้วน · ตารางผลหวยเก็บสามบนไว้ด้วย
        const data = await api<GroupsResponse>("/api/lottery/datasets?digits=2");
        if (cancelled) return;
        setYears(data.years);
        setTestYear((current) => current || data.years[data.years.length - 1] || "");
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "โหลดรายชื่อหวยไม่สำเร็จ");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api, canViewLottery]);

  // ปีที่เลือกเป็น train ได้ = ปีก่อน test เท่านั้น (ปีหลังคือ lookahead)
  const trainOptions = useMemo(
    () => years.filter((year) => year < testYear).sort().reverse(),
    [years, testYear],
  );

  // เปลี่ยนปี test แล้วปีที่เคยเลือกไว้อาจกลายเป็นปีอนาคต → ตัดทิ้ง
  // (เหลือศูนย์ = กลับไปเป็น "ทุกปีก่อนหน้า" เอง ไม่ใช่ตารางว่างเปล่าโดยไม่บอกสาเหตุ)
  useEffect(() => {
    setTrainYears((current) => current.filter((year) => year < testYear));
  }, [testYear]);

  /** ส่งเป็นสตริงเดียวเพื่อให้ใช้เป็น dependency ของ effect ได้ (array สร้างใหม่ทุกเรนเดอร์) */
  const trainParam = [...trainYears].sort().join(",");

  // คำนวณตารางอันดับใหม่เมื่อค่าตั้งเปลี่ยน — หน่วงไว้ก่อน เพราะพิมพ์เลขทีละหลัก
  useEffect(() => {
    if (!canViewLottery || !testYear) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const query = new URLSearchParams({
            formula,
            year: testYear,
            mode,
            capital: String(capital),
            bet: String(bet),
            payout: String(payout),
          });
          if (trainParam) query.set("train", trainParam);
          const data = await api<RankResponse>(`/api/lottery/rank?${query}`);
          if (cancelled) return;
          setRows(data.rows);
          setError(null);
        } catch (caught) {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "คำนวณไม่สำเร็จ");
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, canViewLottery, formula, testYear, trainParam, mode, capital, bet, payout]);

  // เปลี่ยนค่าตั้งค่าใด ๆ = ตัวเลขในกล่องรายละเอียดเก่าใช้ไม่ได้แล้ว
  /** แถวที่เปิดป๊อปอัปอยู่ — null = ปิด */
  const openRow = useMemo(
    () => (rows ?? []).find((row) => KEY(row.lottery, row.position) === openKey) ?? null,
    [openKey, rows],
  );

  const openDetail = useCallback(
    async (row: RankRow) => {
      const key = KEY(row.lottery, row.position);
      setOpenKey(key);
      setAnalysis(null);
      setDetailError(null);
      setChosenRank(1);
      try {
        let entries = cache.current.get(key);
        if (!entries) {
          const query = new URLSearchParams({ lottery: row.lottery, position: row.position });
          const data = await api<EntriesResponse>(`/api/lottery/datasets?${query}`);
          entries = data.entries;
          cache.current.set(key, entries);
        }
        const testStr = entries.find((entry) => entry.year === testYear)?.sequence ?? "";
        setTestStr(testStr);
        // ⚠️ ต้องกรองด้วยกติกาเดียวกับ `trainYearsOf` ฝั่ง server เป๊ะ ๆ ไม่งั้นเลขในกล่อง
        // รายละเอียดจะไม่ตรงกับแถวในตารางที่เพิ่งกดเปิด — คนอ่านจับไม่ได้ว่าอันไหนจริง
        const usedTrainYears = trainYearsOf(
          entries.map((entry) => entry.year),
          testYear,
          trainYears,
        );
        const trainStr = usedTrainYears
          .map((year) => entries?.find((entry) => entry.year === year)?.sequence ?? "")
          .join("");
        const result = analyzeGroup({
          trainStr,
          testStr,
          trainYears: usedTrainYears,
          formula,
          mode,
          capital,
          betPerNumber: bet,
          payoutRate: payout,
        });
        if (!result) throw new Error("ข้อมูลปีนี้ไม่พอสำหรับคำนวณ");
        setAnalysis(result);
      } catch (caught) {
        setDetailError(caught instanceof Error ? caught.message : "โหลดรายละเอียดไม่สำเร็จ");
      }
    },
    [api, bet, capital, formula, mode, payout, testYear, trainYears],
  );

  // ค่าตั้งเปลี่ยน = ปิดกล่องรายละเอียด ไม่ให้ค้างตัวเลขของค่าตั้งเก่า
  useEffect(() => {
    setOpenKey(null);
    setAnalysis(null);
  }, [formula, testYear, trainParam, mode, capital, bet, payout]);

  const choice = analysis?.choices.find((item) => item.rank === chosenRank) ?? analysis?.choices[0];
  const equity = useMemo(
    () => (analysis && choice ? analysis.equityOf(choice.size) : null),
    [analysis, choice],
  );
  const risk = useMemo(() => (equity ? computeRiskMetrics(equity) : null), [equity]);
  const baseline = useMemo(
    () =>
      choice
        ? randomBaseline({
            nBet: choice.size,
            actualDays: choice.days,
            betPerNumber: bet,
            payoutRate: payout,
            actualProfit: choice.profit,
          })
        : null,
    [bet, choice, payout],
  );

  /** เส้นแบ่งเดือนของกราฟรายหวย — index ตาม **งวดจริง** (คนละระบบกับเส้นทุนพอร์ต) */
  const monthDivs = useMemo(
    // หน้านี้เป็นสูตร 2 ตัวล้วน (API ขอ `digits: 2` เสมอ) ⇒ 1 งวด = 2 ตัวอักษรแน่นอน
    () => (testStr ? drawMonthDividers(testStr, testYear, 2) : []),
    [testStr, testYear],
  );

  /** เส้นทุนของทั้ง 10 อันดับ + ตัวเลขความเสี่ยงของแต่ละอันดับ (ตาราง Top 10) */
  const topRows = useMemo(() => {
    if (!analysis) return [];
    return analysis.choices.map((item) => {
      const curve = analysis.equityOf(item.size);
      return { choice: item, curve, risk: computeRiskMetrics(curve) };
    });
  }, [analysis]);

  /** กำไรรายเดือนของช่วง test — ตัดเส้นทุนตามเส้นแบ่งเดือนที่คิดไว้แล้ว */
  const monthly = useMemo(() => {
    if (!equity || equity.length < 2) return [];
    const bounds = [0, ...monthDivs.map(([, at]) => at), equity.length - 1];
    const labels = ["Jan", ...monthDivs.map(([name]) => name)];
    const out: { label: string; profit: number; start: number }[] = [];
    for (let i = 0; i < labels.length; i += 1) {
      const from = Math.min(bounds[i], equity.length - 1);
      const to = Math.min(bounds[i + 1] ?? equity.length - 1, equity.length - 1);
      if (to <= from) continue;
      out.push({ label: labels[i], profit: equity[to] - equity[from], start: equity[from] });
    }
    return out;
  }, [equity, monthDivs]);

  const maxProfit = Math.max(1, ...(rows ?? []).map((row) => Math.abs(row.profit)));

  if (!canViewLottery) {
    return (
      <div className="space-y-3.5">
        <PageHeader title="สูตร" />
        <Alert tone="warn">หน้านี้เปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="สูตร"
        subtitle={`เรียงตามกำไรของปี test ${testYear || "—"} · ${rows?.length ?? 0} หวย`}
      />

      <section className="card space-y-2.5 px-3.5 py-3">
        <div>
          <p className="field-label">สูตร</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {FORMULA_NAMES.map((name) => (
              <Chip key={name} active={formula === name} onClick={() => setFormula(name)}>
                {name}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">ปี test</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {years.map((year) => (
              <Chip key={year} active={testYear === year} onClick={() => setTestYear(year)}>
                25{year}
              </Chip>
            ))}
          </div>
        </div>

        <div>
          <p className="field-label">ปี train (ข้อมูลที่สูตรเอาไปนับ)</p>
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <Chip active={trainYears.length === 0} onClick={() => setTrainYears([])}>
              ทุกปีก่อนหน้า
            </Chip>
            {trainOptions.map((year) => (
              <Chip
                key={year}
                active={trainYears.includes(year)}
                onClick={() =>
                  setTrainYears((current) =>
                    current.includes(year)
                      ? current.filter((item) => item !== year)
                      : [...current, year],
                  )
                }
              >
                25{year}
              </Chip>
            ))}
          </div>
          <p className="dim mt-1 text-[10.5px] leading-relaxed">
            {trainYears.length === 0
              ? "ใช้ทุกปีที่อยู่ก่อนปี test ของหวยนั้น — หวยที่มีข้อมูลไม่เท่ากันก็ใช้เท่าที่มี"
              : `เทรนด้วย ${[...trainYears].sort().map((year) => `25${year}`).join(" · ")} เท่านั้น — หวยที่ไม่มีปีพวกนี้จะหลุดจากตาราง`}
          </p>
        </div>

        <div>
          <p className="field-label">เลือก n_bet จาก</p>
          <div className="flex gap-1.5">
            <Chip active={mode === "train"} onClick={() => setMode("train")}>
              ปีก่อนหน้า (ใช้จริงได้)
            </Chip>
            <Chip active={mode === "hindsight"} onClick={() => setMode("hindsight")}>
              รู้ผลแล้ว
            </Chip>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <NumberField label="ทุนเริ่มต้น" value={capital} onChange={setCapital} min={0} />
          <NumberField label="เงินแทง/ตัว" value={bet} onChange={setBet} min={1} />
          <NumberField label="เรตจ่าย" value={payout} onChange={setPayout} min={1} />
        </div>
      </section>

      {mode === "hindsight" ? (
        <Alert tone="warn">
          โหมด “รู้ผลแล้ว” เลือกจำนวนเลขที่กำไรดีที่สุด<b>หลังจากเห็นผลปีนั้นแล้ว</b> —
          เป็นเพดานทฤษฎีเท่านั้น ใช้ตัดสินใจแทงจริงไม่ได้ และตัวเลข “เทียบกับสุ่ม” ก็เอียงตาม
        </Alert>
      ) : null}

      {error ? <Alert tone="error">{error}</Alert> : null}
      {loading ? <Spinner label="กำลังคำนวณ..." /> : null}

      {!loading && rows && rows.length === 0 ? (
        <div className="card px-4 py-5">
          <EmptyState>
            {trainYears.length === 0
              ? `ไม่มีหวยที่มีผลของปี 25${testYear} และมีปีก่อนหน้าให้เทรน`
              : `ไม่มีหวยที่มีทั้งผลปี 25${testYear} และปี train ที่เลือกไว้`}
          </EmptyState>
          {trainYears.length > 0 ? (
            // ตารางว่างเพราะ "เลือกปีแคบไป" กับ "ไม่มีข้อมูลจริง ๆ" หน้าตาเหมือนกัน
            // ⇒ ต้องบอกทางออกไว้ ไม่ใช่ปล่อยให้เดาว่าระบบพัง
            <p className="muted text-center text-[12px] leading-relaxed">
              ลองกด “ทุกปีก่อนหน้า” หรือเลือกปีให้น้อยลง
            </p>
          ) : null}
        </div>
      ) : null}

      {!loading && rows && rows.length > 0 ? (
        <section className="card px-3.5 py-3">
          <SectionTitle>อันดับหวย</SectionTitle>
          {rows.map((row, index) => {
            const key = KEY(row.lottery, row.position);
            return (
              <button
                key={key}
                type="button"
                className="row w-full py-2.5 text-left"
                onClick={() => void openDetail(row)}
              >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold">
                      <span className="dim tnum mr-1.5">{index + 1}.</span>
                      {row.flag} {row.lottery} · {row.position}
                    </span>
                    <span
                      className="tnum flex-none text-[13px] font-bold"
                      style={{ color: row.profit >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
                    >
                      {formatSigned(row.profit)}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProfitBar value={row.profit} max={maxProfit} />
                  </div>
                  <p className="dim mt-1 text-[10.5px]">
                    แทง {row.nBet} เลข · ถูก {row.wins}/{row.days} งวด ({row.winRate.toFixed(1)}%) · ROI ต่อ
                    เงินหมุน {row.roiPct >= 0 ? "+" : ""}
                    {row.roiPct.toFixed(1)}%
                    {row.z != null ? ` · เกินสุ่ม ${row.z >= 0 ? "+" : ""}${row.z.toFixed(1)} SD` : ""}
                  {" · แตะดูรายละเอียด"}
                </p>
              </button>
            );
          })}
        </section>
      ) : null}

      {/* รายละเอียดของหวยเป็น **แผ่นเลื่อนขึ้นจากล่าง** ไม่ใช่กางในลิสต์
          — เนื้อหายาวกว่าหนึ่งจอ กางแล้วอันดับที่เหลือถูกดันหายไป ต้องเลื่อนหาที่กดต่อ
          (แบบเดียวกับ st.dialog ของแอปเดิม และเหมือนป๊อปอัปรายขาที่หน้าพอร์ต) */}
      {openRow ? (
        <Modal
          title={`${openRow.flag} ${openRow.lottery} · ${openRow.position}`}
          subtitle={`${formula} · วัดผลปี 25${testYear}`}
          onClose={() => setOpenKey(null)}
        >
                  {detailError ? <Alert tone="error">{detailError}</Alert> : null}
                  {!analysis && !detailError ? <Spinner label="กำลังคำนวณ..." /> : null}
                  {analysis && choice ? (
                    <div className="space-y-2.5">
                      <p className="dim text-[10.5px]">
                        เทรนด้วยปี {analysis.trainYears.map((year) => `25${year}`).join(", ")} · วัดผลปี 25
                        {testYear}
                      </p>
                      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                        {analysis.choices.map((item) => (
                          <Chip
                            key={item.rank}
                            active={item.rank === (choice?.rank ?? 1)}
                            onClick={() => setChosenRank(item.rank)}
                          >
                            #{item.rank} · {item.size} เลข
                          </Chip>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Kpi
                          label="กำไร"
                          value={formatSigned(choice.profit)}
                          sub={`แทง ${choice.size} เลข × ${formatBahtShort(bet)} บ.`}
                          tone={choice.profit >= 0 ? "up" : "down"}
                        />
                        <Kpi
                          label="อัตราถูก"
                          value={`${choice.winRate.toFixed(1)}%`}
                          sub={`${choice.wins}/${choice.days} งวด`}
                        />
                        <Kpi
                          label="Max DD"
                          value={formatBahtShort(choice.maxDrawdown)}
                          sub="ต่ำสุดเทียบกับทุนตั้งต้น"
                        />
                        {mode === "train" ? (
                          <Kpi
                            label="อันดับใน test"
                            value={`#${choice.testRank}`}
                            sub={choice.testRank <= 10 ? "ปีก่อนหน้าเดาไม่หลุด" : "ปีก่อนหน้าเดาพลาด"}
                          />
                        ) : (
                          <Kpi
                            label="แพ้ติดกันสูงสุด"
                            value={`${risk?.maxLossStreak ?? 0} งวด`}
                            sub={`ลบช่วงนั้น ${formatSigned(risk?.maxLossStreakAmount ?? 0)}`}
                          />
                        )}
                      </div>
                      {equity ? (
                        <div>
                          <SectionTitle>เส้นทุน</SectionTitle>
                          <EquityChart values={equity} capital={capital} monthDivs={monthDivs} />
                        </div>
                      ) : null}
                      {baseline?.z != null ? (
                        <p className="dim text-[10.5px] leading-relaxed">
                          🎲 ถ้าสุ่ม {choice.size} เลขเท่ากัน: คาดหวัง {formatSigned(baseline.expectedProfit)} ·
                          ที่เห็นเกินไป {baseline.z >= 0 ? "+" : ""}
                          {baseline.z.toFixed(2)} SD
                          {baseline.pBetter != null
                            ? ` (สุ่มล้วนได้ดีเท่านี้หรือมากกว่า ${(baseline.pBetter * 100).toFixed(1)}%)`
                            : ""}
                        </p>
                      ) : null}
                      {/* เทียบ Top 10 — เห็นว่าอันดับที่เลือก "อยู่ตรงไหนของกลุ่ม"
                          ทุกเส้นไปทางเดียวกัน = สูตรทน ไม่ได้ขึ้นกับ n ที่เลือกเป๊ะ ๆ */}
                      {topRows.length > 1 ? (
                        <div>
                          <SectionTitle>เทียบทั้ง {topRows.length} อันดับ</SectionTitle>
                          <MultiEquityChart
                            series={topRows.map((item) => ({ label: `#${item.choice.rank}`, values: item.curve }))}
                            capital={capital}
                            selected={topRows.findIndex((item) => item.choice.rank === (choice?.rank ?? 1))}
                            monthDivs={monthDivs}
                          />
                          <p className="dim mt-1 text-[10.5px] leading-relaxed">
                            เส้นหนา = อันดับที่เลือกอยู่ · เส้นจาง = อีก {topRows.length - 1} อันดับ ·
                            ทุกเส้นไปทางเดียวกัน = สูตรทน ไม่ได้ขึ้นกับ n ที่เลือกเป๊ะ ๆ
                          </p>
                        </div>
                      ) : null}

                      {/* ⚠️ โหมด "ปีก่อนหน้า" ต้องโชว์ **อันดับใน test**: ≤10 = n ที่เลือกจากอดีตก็ติด
                          Top 10 ของปีจริงด้วย (overfit น้อย) — เป็นตัวเลขที่ตัดสินว่าเชื่อได้แค่ไหน */}
                      {topRows.length > 0 ? (
                        <div>
                          <SectionTitle>ทุกอันดับ</SectionTitle>
                          <div className="overflow-x-auto">
                            <table className="tnum w-full text-[11.5px]">
                              <thead>
                                <tr className="dim text-[10px]">
                                  <th className="py-1 text-left font-semibold">อันดับ</th>
                                  <th className="py-1 text-right font-semibold">n_bet</th>
                                  <th className="py-1 text-right font-semibold">กำไร</th>
                                  <th className="py-1 text-right font-semibold">ถูก</th>
                                  <th className="py-1 text-right font-semibold">Max DD</th>
                                  <th className="py-1 text-right font-semibold">แพ้ติด</th>
                                  <th className="py-1 text-right font-semibold">
                                    {mode === "train" ? "ใน test" : "Sharpe"}
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {topRows.map(({ choice: item, risk: rowRisk }) => {
                                  const picked = item.rank === (choice?.rank ?? 1);
                                  return (
                                    <tr
                                      key={item.rank}
                                      style={{
                                        borderTop: "1px solid var(--divider)",
                                        background: picked ? "var(--accent-tint)" : undefined,
                                        fontWeight: picked ? 700 : 400,
                                      }}
                                    >
                                      <td className="py-1">#{item.rank}</td>
                                      <td className="py-1 text-right">{item.size}</td>
                                      <td
                                        className="py-1 text-right"
                                        style={{ color: item.profit >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
                                      >
                                        {formatSigned(item.profit)}
                                      </td>
                                      <td className="py-1 text-right">{item.winRate.toFixed(1)}%</td>
                                      <td className="py-1 text-right">{formatBahtShort(item.maxDrawdown)}</td>
                                      <td className="py-1 text-right">{rowRisk.maxLossStreak}</td>
                                      <td className="py-1 text-right">
                                        {mode === "train" ? `#${item.testRank}` : rowRisk.sharpe.toFixed(2)}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          {mode === "train" ? (
                            <p className="dim mt-1 text-[10.5px] leading-relaxed">
                              <b>ใน test ≤ 10</b> = n ที่เลือกจากปีก่อนหน้าก็ติด Top 10 ของปีจริงด้วย →
                              สูตรไม่ overfit เชื่อได้มากกว่า
                            </p>
                          ) : null}
                        </div>
                      ) : null}

                      {/* เดือนไหนพัง เดือนไหนแบก — กำไรทั้งปีก้อนเดียวซ่อนเรื่องนี้ไว้หมด */}
                      {monthly.length > 1 ? (
                        <div>
                          <SectionTitle>กำไรรายเดือน (ช่วง test)</SectionTitle>
                          <div className="overflow-x-auto">
                            <table className="tnum w-full text-[11.5px]">
                              <tbody>
                                {monthly.map((month) => (
                                  <tr key={month.label} style={{ borderTop: "1px solid var(--divider)" }}>
                                    <td className="py-1 font-semibold">{month.label}</td>
                                    <td className="dim py-1 text-right text-[10.5px]">
                                      ทุนต้นเดือน {formatBahtShort(month.start)}
                                    </td>
                                    <td
                                      className="py-1 text-right font-bold"
                                      style={{ color: month.profit >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
                                    >
                                      {formatSigned(month.profit)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        className="dim text-[11.5px] font-semibold"
                        onClick={() => setShowNumbers((value) => !value)}
                      >
                        {showNumbers ? "ซ่อนเลข" : `ดูเลขที่แทง (${choice.size} ตัว)`}
                      </button>
                      {showNumbers ? (
                        <p className="tnum dim text-[10.5px] leading-relaxed break-all">
                          {analysis.numbers.slice(0, choice.size).join(" ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
        </Modal>
      ) : null}

      <p className="dim px-1 pb-1 text-center text-[10.5px] leading-relaxed">
        ทั้งหมดเป็นผลย้อนหลังของปีเดียว ไม่ใช่การรับประกันผลในอนาคต
        <br />
        หวยที่มีงวดน้อยหรือกำไรมาจากงวดเดียว ตัวเลขจะแกว่งด้วยดวงมากกว่าฝีมือสูตร
      </p>
    </div>
  );
}
