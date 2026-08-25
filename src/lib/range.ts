import { APP_TIMEZONE } from "./env";
import { HttpError } from "./http";
import {
  currentMonthKey,
  dayRange,
  formatThaiDate,
  formatThaiMonth,
  monthRange,
  todayKey,
} from "./thai-date";

export interface ResolvedRange {
  from: Date;
  /** ปลายทางแบบไม่รวม (exclusive) */
  to: Date;
  label: string;
  kind: "day" | "month" | "custom";
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_KEY = /^\d{4}-\d{2}$/;

function shiftDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * แปลง query string เป็นช่วงเวลา
 *   ?range=today|yesterday|month|last7|last30
 *   ?date=2026-08-25
 *   ?month=2026-08
 *   ?from=2026-08-01&to=2026-08-31   (รวมวันปลายทาง)
 * ค่าเริ่มต้น = เดือนปัจจุบัน
 */
export function resolveRange(
  params: URLSearchParams,
  timeZone: string = APP_TIMEZONE,
): ResolvedRange {
  const range = params.get("range");
  const date = params.get("date");
  const month = params.get("month");
  const from = params.get("from");
  const to = params.get("to");

  if (date) {
    if (!DATE_KEY.test(date)) throw new HttpError(400, "รูปแบบ date ต้องเป็น YYYY-MM-DD");
    const { start, end } = dayRange(date, timeZone);
    return { from: start, to: end, label: formatThaiDate(start, timeZone), kind: "day" };
  }

  if (month) {
    if (!MONTH_KEY.test(month)) throw new HttpError(400, "รูปแบบ month ต้องเป็น YYYY-MM");
    const { start, end } = monthRange(month, timeZone);
    return { from: start, to: end, label: formatThaiMonth(month), kind: "month" };
  }

  if (from || to) {
    if (!from || !to || !DATE_KEY.test(from) || !DATE_KEY.test(to)) {
      throw new HttpError(400, "ต้องส่ง from และ to เป็น YYYY-MM-DD ทั้งคู่");
    }
    if (from > to) throw new HttpError(400, "วันเริ่มต้นต้องไม่เกินวันสิ้นสุด");
    const start = dayRange(from, timeZone).start;
    const end = dayRange(to, timeZone).end;
    return {
      from: start,
      to: end,
      label: `${formatThaiDate(start, timeZone)} – ${formatThaiDate(new Date(end.getTime() - 1), timeZone)}`,
      kind: "custom",
    };
  }

  switch (range) {
    case "today": {
      const key = todayKey(timeZone);
      const { start, end } = dayRange(key, timeZone);
      return { from: start, to: end, label: `วันนี้ ${formatThaiDate(start, timeZone)}`, kind: "day" };
    }
    case "yesterday": {
      const key = shiftDateKey(todayKey(timeZone), -1);
      const { start, end } = dayRange(key, timeZone);
      return { from: start, to: end, label: `เมื่อวาน ${formatThaiDate(start, timeZone)}`, kind: "day" };
    }
    case "last7":
    case "last30": {
      const days = range === "last7" ? 6 : 29;
      const startKey = shiftDateKey(todayKey(timeZone), -days);
      const start = dayRange(startKey, timeZone).start;
      const end = dayRange(todayKey(timeZone), timeZone).end;
      return { from: start, to: end, label: `${days + 1} วันล่าสุด`, kind: "custom" };
    }
    default: {
      const key = currentMonthKey(timeZone);
      const { start, end } = monthRange(key, timeZone);
      return { from: start, to: end, label: formatThaiMonth(key), kind: "month" };
    }
  }
}
