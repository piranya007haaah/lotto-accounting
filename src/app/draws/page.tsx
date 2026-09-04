"use client";

/**
 * กรอกผลหวยรายวัน → เด้งการ์ดเข้า LINE
 *
 * ลำดับบนจอ = **ลำดับที่หวยออกจริง** (เรียงตาม `schedule.lottery_times` ของพอร์ต)
 * ⇒ เปิดหน้ามาตอนหวยออก ตัวที่ต้องกรอกอยู่ตรงที่สายตาไปถึงพอดี ไม่ต้องไล่หา
 *
 * ⚠️ กรอก **สามบน** แล้วสองบนเติมให้เอง (2 หลักท้ายของสามบน = สองบน เป๊ะทุกงวด)
 * ⇒ หวยที่มีขาสามบนจึงเหลือกรอกแค่ 2 ช่อง · ฝั่ง API เป็นคนเติมจริง ที่นี่แค่ซ่อนช่อง
 *
 * ⚠️ ผลที่กรอกแล้ว **ล็อกไว้** — จะแก้ต้องกด “แก้ไขผล” ซึ่งจะทับของเดิมและส่งการ์ดใหม่
 * ที่ประกาศว่าเป็นการแก้ไข (ส่งเข้า LINE แล้วถอนคืนไม่ได้ ต้องบอกให้ชัดว่าอันไหนของจริง)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/LiffProvider";
import { Alert, Chip, EmptyState, PageHeader, Spinner } from "@/components/ui";
import { formatBahtShort, formatSigned } from "@/lib/format";

interface LegState {
  position: string;
  digits: number;
  status: "hit" | "miss" | "no-bet" | "holiday" | "pending";
  draw: string | null;
  nBet: number;
  betPerNumber: number;
  payoutRate: number;
  cost: number;
  pnl: number;
}

interface LotteryState {
  lottery: string;
  flag: string;
  time: string | null;
  pnl: number;
  cost: number;
  complete: boolean;
  untouched: boolean;
  legs: LegState[];
}

interface DayState {
  date: string;
  yearBe: string;
  portfolioId: number;
  portfolioName: string;
  pnl: number;
  cost: number;
  doneCount: number;
  totalCount: number;
  warnings: string[];
  lotteries: LotteryState[];
}

interface DayResponse {
  portfolios: { id: number; name: string; isActive: boolean }[];
  day: DayState;
  lineReady: boolean;
  lineProblem: string | null;
}

interface SaveResponse {
  saved: string[];
  already: string[];
  day: DayState;
  line: { sent: boolean; reason: string | null };
}

interface TestResponse {
  test: true;
  lottery: string;
  messages: number;
  day: DayState;
  line: { sent: boolean; reason: string | null };
}

/** วันนี้ตามเวลาไทย — เซิร์ฟเวอร์เป็น UTC ถ้าไม่ชดเชยจะได้ "เมื่อวาน" ก่อนเที่ยงคืนไทย */
function todayBkk(): string {
  return new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
}

function thaiDate(iso: string): string {
  const [y, m, d] = iso.split("-").map((v) => Number.parseInt(v, 10));
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  if (!y || !m || !d) return iso;
  return `${d} ${months[m - 1]} ${y + 543}`;
}

/** ตำแหน่งที่ต้องพิมพ์เอง — สองบนไม่ต้อง ถ้าหวยนี้มีขาสามบน (API เติมให้) */
function inputLegs(group: LotteryState): LegState[] {
  const hasThree = group.legs.some((leg) => leg.digits === 3);
  return group.legs.filter((leg) => !(hasThree && leg.position === "สองบน"));
}

function statusText(leg: LegState): string {
  if (leg.status === "hit") return `ออก ${leg.draw} ✅ ${formatSigned(leg.pnl)}`;
  if (leg.status === "miss") return `ออก ${leg.draw} ❌ ${formatSigned(leg.pnl)}`;
  if (leg.status === "no-bet") return `ออก ${leg.draw} · เดือนนี้ไม่ได้แทง`;
  if (leg.status === "holiday") return "งดออก";
  return "ยังไม่มีผล";
}

function LotteryCard({
  group,
  disabled,
  saving,
  onSave,
}: {
  group: LotteryState;
  disabled: boolean;
  saving: boolean;
  onSave: (draws: Record<string, string>, overwrite: boolean) => void;
}) {
  const fields = inputLegs(group);
  const [values, setValues] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);

  // สลับวัน/สลับพอร์ตแล้วช่องต้องว่าง ไม่ใช่ค้างเลขของวันก่อน
  useEffect(() => {
    setValues({});
    setEditing(false);
  }, [group.lottery, group.legs.map((l) => l.draw ?? "").join("|")]);

  const locked = group.complete && !editing;
  const ready = fields.every((leg) => (values[leg.position] ?? "").length === leg.digits);

  return (
    <section className="card space-y-2.5 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-[13.5px] font-semibold">
          {group.flag} {group.lottery}
        </p>
        <span className="dim tnum flex-none text-[11.5px]">{group.time ?? "ยังไม่ตั้งเวลา"}</span>
      </div>

      {group.untouched ? null : (
        <div className="space-y-0.5">
          {group.legs.map((leg) => (
            <p key={leg.position} className="dim text-[11px]">
              <b className="text-[11.5px]" style={{ color: "var(--text)" }}>
                {leg.position}
              </b>{" "}
              · {statusText(leg)}
            </p>
          ))}
          <p className="text-[12px] font-semibold" style={{ color: group.pnl >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}>
            รวมหวยนี้ {formatSigned(group.pnl)} บ.
          </p>
        </div>
      )}

      {locked ? (
        <button
          type="button"
          className="btn btn-ghost py-2 text-[12.5px]"
          disabled={disabled}
          onClick={() => setEditing(true)}
        >
          ✏️ แก้ไขผล
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {fields.map((leg) => (
              <label key={leg.position} className="block">
                <span className="field-label">
                  {leg.position} · {leg.digits} หลัก
                </span>
                <input
                  className="field tnum text-center text-[17px] font-bold tracking-[0.15em]"
                  inputMode="numeric"
                  maxLength={leg.digits}
                  placeholder={"0".repeat(leg.digits)}
                  value={values[leg.position] ?? ""}
                  disabled={disabled || saving}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\d]/g, "").slice(0, leg.digits);
                    setValues((current) => ({ ...current, [leg.position]: next }));
                  }}
                />
                <span className="dim mt-1 block text-[10px] leading-tight">
                  แทง {leg.nBet} เลข × {formatBahtShort(leg.betPerNumber)} บ. · เรต {leg.payoutRate}
                </span>
              </label>
            ))}
          </div>

          {group.legs.some((leg) => leg.digits === 3) ? (
            <p className="dim text-[10.5px]">สองบนเติมให้เองจาก 2 หลักท้ายของสามบน</p>
          ) : null}

          <div className="flex items-center gap-2">
            {editing ? (
              <button
                type="button"
                className="btn btn-ghost flex-none py-2 text-[12.5px]"
                disabled={saving}
                onClick={() => setEditing(false)}
              >
                ยกเลิก
              </button>
            ) : null}
            <button
              type="button"
              className="btn btn-primary flex-1 py-2.5 text-[13px]"
              disabled={disabled || saving || !ready}
              onClick={() => onSave(values, editing)}
            >
              {saving ? "กำลังบันทึก..." : editing ? "💾 ทับของเดิม + ส่งการ์ดแก้ไข" : "💾 บันทึก + ส่งเข้า LINE"}
            </button>
          </div>
          {editing ? (
            <p className="dim text-[10.5px] leading-relaxed">
              ผลเดิมจะถูกทับ และการ์ดใบใหม่จะขึ้นหัวว่า <b>แก้ไขผล</b> — ข้อความเก่าใน LINE ลบไม่ได้
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

export default function DrawsPage() {
  const { api, canViewLottery, isAdmin, profile } = useAuth();

  const [date, setDate] = useState(todayBkk());
  const [portfolioId, setPortfolioId] = useState<number | null>(null);
  const [data, setData] = useState<DayResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ date });
      if (portfolioId !== null) query.set("portfolioId", String(portfolioId));
      const next = await api<DayResponse>(`/api/lottery/draws?${query}`);
      setData(next);
      // ตั้งเฉพาะรอบแรก — ตั้งทุกรอบแล้ว `load` เปลี่ยน identity ⇒ ยิงซ้ำอีกหนึ่งครั้งเปล่า ๆ
      setPortfolioId((current) => current ?? next.day.portfolioId);
      setError(null);
    } catch (caught) {
      setData(null);
      setError(caught instanceof Error ? caught.message : "โหลดไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
    // portfolioId ตั้งจากคำตอบ ⇒ ใส่ใน deps จะวนซ้ำ — ตั้งใจอ่านค่าล่าสุดตอนเรียกเท่านั้น
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, date, portfolioId]);

  useEffect(() => {
    if (!canViewLottery) {
      setLoading(false);
      return;
    }
    void load();
  }, [canViewLottery, load]);

  const save = useCallback(
    async (lottery: string, draws: Record<string, string>, overwrite: boolean) => {
      setSavingFor(lottery);
      setSaveError(null);
      setNote(null);
      try {
        const result = await api<SaveResponse>("/api/lottery/draws", {
          method: "POST",
          body: JSON.stringify({ portfolioId, date, lottery, draws, overwrite }),
        });
        setData((current) => (current ? { ...current, day: result.day } : current));
        const group = result.day.lotteries.find((l) => l.lottery === lottery);
        const line = result.line.sent
          ? "ส่งการ์ดเข้า LINE แล้ว"
          : `ยังไม่ได้ส่งเข้า LINE (${result.line.reason ?? "ไม่ทราบสาเหตุ"})`;
        setNote(
          `บันทึก ${lottery} แล้ว · หวยนี้ ${formatSigned(group?.pnl ?? 0)} บ. · ` +
            `วันนี้รวม ${formatSigned(result.day.pnl)} บ. — ${line}`,
        );
      } catch (caught) {
        setSaveError(caught instanceof Error ? caught.message : "บันทึกไม่สำเร็จ");
      } finally {
        setSavingFor(null);
      }
    },
    [api, date, portfolioId],
  );

  /** ส่งการ์ดจากผลที่มีอยู่แล้ว — ไม่เขียนอะไรลงฐานข้อมูล ไว้ดูว่าปลายทางตั้งถูกไหม */
  const sendTest = useCallback(async () => {
    setTesting(true);
    setSaveError(null);
    setNote(null);
    try {
      const result = await api<TestResponse>("/api/lottery/draws", {
        method: "POST",
        body: JSON.stringify({ portfolioId, date, test: true }),
      });
      setNote(
        result.line.sent
          ? `ส่งการ์ดทดสอบแล้ว (${result.lottery} · ${result.messages} ข้อความ) — ไปดูใน LINE ได้เลย ไม่มีอะไรถูกบันทึก`
          : `ส่งไม่สำเร็จ: ${result.line.reason ?? "ไม่ทราบสาเหตุ"}`,
      );
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : "ส่งการ์ดทดสอบไม่สำเร็จ");
    } finally {
      setTesting(false);
    }
  }, [api, date, portfolioId]);

  const day = data?.day ?? null;
  const roi = useMemo(() => (day && day.cost > 0 ? (day.pnl / day.cost) * 100 : null), [day]);

  if (!canViewLottery) {
    return (
      <div className="space-y-3.5">
        <PageHeader title="กรอกผล" />
        <Alert tone="warn">หน้านี้เปิดให้เฉพาะคนที่ผู้ดูแลอนุญาต</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      <PageHeader
        title="กรอกผล"
        subtitle={day ? `${day.portfolioName} · ${thaiDate(day.date)}` : "กรอกผลหวยแล้วส่งเข้า LINE"}
      />

      <section className="card space-y-2.5 px-3.5 py-3">
        <label className="block">
          <span className="field-label">วันที่ของงวด</span>
          <input
            className="field tnum"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayBkk())}
          />
        </label>
        {(data?.portfolios.length ?? 0) > 1 ? (
          <div>
            <p className="field-label">พอร์ต</p>
            <div className="flex gap-1.5 overflow-x-auto pb-0.5">
              {data?.portfolios.map((p) => (
                <Chip key={p.id} active={portfolioId === p.id} onClick={() => setPortfolioId(p.id)}>
                  {p.isActive ? `★ ${p.name}` : p.name}
                </Chip>
              ))}
            </div>
          </div>
        ) : null}
        {data && !data.lineReady ? (
          <div className="dim space-y-1 text-[10.5px] leading-relaxed">
            <p>
              ⚠️ ยังส่งการ์ดเข้า LINE ไม่ได้ — บันทึกผลได้ตามปกติ
              <br />
              <b>{data.lineProblem ?? "ยังไม่ได้ตั้งปลายทาง"}</b>
            </p>
            {/* ⚠️ ตัวแปรของ Vercel แยกตาม environment — ใส่ไว้ที่ Preview อย่างเดียว
                Production จะไม่เห็น แล้วหน้าจอจะขึ้นว่า "ยังไม่ได้ตั้ง" ทั้งที่ใส่ไปแล้ว */}
            <p>
              ตั้งที่ Vercel → Settings → Environment Variables โดยต้องติ๊ก{" "}
              <b>Production</b> ด้วย แล้ว Redeploy (ใส่ไว้แต่ Preview = Production ไม่เห็น)
            </p>
            {/* ปลายทางที่ง่ายที่สุดคือแชทส่วนตัวกับ OA — id ของตัวเองอยู่ตรงนี้แล้ว
                ไม่ต้องไปงมที่ไหน · จะส่งเข้ากลุ่มค่อยเชิญ OA เข้ากลุ่มแล้วพิมพ์ /id */}
            {profile?.userId ? (
              <p>
                จะส่งเข้าแชทส่วนตัวก่อนก็ได้ — ใช้ id นี้:{" "}
                <button
                  type="button"
                  className="tnum underline"
                  onClick={() => void navigator.clipboard?.writeText(profile.userId)}
                  title="แตะเพื่อคัดลอก"
                >
                  {profile.userId}
                </button>
              </p>
            ) : null}
            <p>ส่งเข้ากลุ่ม: เชิญ OA เข้ากลุ่มนั้น แล้วพิมพ์ <code className="text-[10px]">/id</code> ในกลุ่ม</p>
          </div>
        ) : null}
      </section>

      {loading ? <Spinner label="กำลังโหลด..." /> : null}
      {error ? <Alert tone="error">{error}</Alert> : null}
      {saveError ? <Alert tone="error">{saveError}</Alert> : null}
      {note ? <Alert tone="success">{note}</Alert> : null}

      {day && day.warnings.length > 0 ? (
        <Alert tone="warn" title="บางขายังคำนวณไม่ได้">
          {day.warnings.slice(0, 3).join(" · ")}
        </Alert>
      ) : null}

      {day ? (
        <div className="card px-3.5 py-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[12.5px] font-semibold">วันนี้ถึงตอนนี้</span>
            <span
              className="tnum text-[17px] font-bold"
              style={{ color: day.pnl >= 0 ? "var(--color-money-out)" : "var(--color-money-in)" }}
            >
              {formatSigned(day.pnl)}
            </span>
          </div>
          <p className="dim mt-0.5 text-[10.5px]">
            ออกแล้ว {day.doneCount} จาก {day.totalCount} หวย · ลงเงิน {formatBahtShort(day.cost)} บ.
            {roi === null ? "" : ` · ${roi >= 0 ? "+" : "−"}${Math.abs(roi).toFixed(1)}% ของเงินที่ลง`}
          </p>
          {/* ทดสอบปลายทาง/หน้าตาการ์ดโดยไม่ต้องกรอกผลปลอม — กรอกแล้วมันล็อก
              ต้องกด "แก้ไขผล" ทับ ซึ่งการ์ดที่ผิดก็ส่งไป LINE แล้ว */}
          {isAdmin && data?.lineReady && day.doneCount > 0 ? (
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full py-2 text-[12.5px]"
              disabled={testing}
              onClick={() => void sendTest()}
            >
              {testing ? "กำลังส่ง..." : "📤 ส่งการ์ดทดสอบเข้า LINE (ไม่บันทึกอะไร)"}
            </button>
          ) : null}
        </div>
      ) : null}

      {day && day.lotteries.length === 0 && !loading ? (
        <div className="card px-4 py-5">
          <EmptyState>พอร์ตนี้ไม่มีขาของปี 25{day.yearBe}</EmptyState>
          <p className="muted text-center text-[12px] leading-relaxed">
            เลือกวันที่ในปีที่พอร์ตใช้ทดสอบ หรือแก้ปีของขาที่หน้าพอร์ต
          </p>
        </div>
      ) : null}

      {day?.lotteries.map((group) => (
        <LotteryCard
          key={group.lottery}
          group={group}
          disabled={!isAdmin}
          saving={savingFor === group.lottery}
          onSave={(draws, overwrite) => void save(group.lottery, draws, overwrite)}
        />
      ))}

      {!isAdmin && day ? (
        <p className="dim px-1 text-center text-[10.5px]">กรอกผลได้เฉพาะผู้ดูแล — คนอื่นดูได้อย่างเดียว</p>
      ) : null}
    </div>
  );
}
