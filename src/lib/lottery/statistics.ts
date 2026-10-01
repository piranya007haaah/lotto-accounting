import { dailyPairs } from "./formulas";

export interface StatisticsGroup {
  lottery: string;
  position: string;
  flag?: string;
  years: string[];
}

export interface StatisticsSelection {
  groups: { lottery: string; position: string }[];
  years: string[];
}

export interface StatisticsEntry {
  lottery: string;
  position: string;
  year: string;
  sequence: string;
  digits?: number;
}

export interface Frequency {
  number: string;
  count: number;
  share: number | null;
}

export interface GroupStatistics {
  lottery: string;
  position: string;
  selectedYears: string[];
  availableYears: string[];
  draws: number;
  status: "มีข้อมูล" | "ไม่มีข้อมูลในปีที่เลือก" | "ไม่มีงวดจริง";
  numbers: Frequency[];
  digits: { place: "หลักสิบ" | "หลักหน่วย"; frequencies: Frequency[] }[];
}

export const statisticsGroupKey = (lottery: string, position: string) =>
  JSON.stringify([lottery, position]);

/** Count each year separately: incomplete final slots must never join across years. */
export function buildStatistics(
  entries: readonly StatisticsEntry[],
  selection: StatisticsSelection,
): GroupStatistics[] {
  const years = [...new Set(selection.years)].sort();
  const wantedYears = new Set(years);
  const byGroup = new Map<string, StatisticsEntry[]>();
  for (const entry of entries) {
    if ((entry.digits ?? 2) !== 2 || !wantedYears.has(entry.year)) continue;
    const key = statisticsGroupKey(entry.lottery, entry.position);
    const group = byGroup.get(key) ?? [];
    group.push(entry);
    byGroup.set(key, group);
  }

  const uniqueGroups = new Map(selection.groups.map((group) => [
    statisticsGroupKey(group.lottery, group.position), group,
  ]));
  return [...uniqueGroups.values()].map(({ lottery, position }) => {
    const rows = byGroup.get(statisticsGroupKey(lottery, position)) ?? [];
    const counts = new Array<number>(100).fill(0);
    const tens = new Array<number>(10).fill(0);
    const units = new Array<number>(10).fill(0);
    let draws = 0;
    for (const row of rows) {
      for (const pair of dailyPairs(row.sequence)) {
        counts[Number(pair)] += 1;
        tens[Number(pair[0])] += 1;
        units[Number(pair[1])] += 1;
        draws += 1;
      }
    }
    const frequencies = (values: number[], width: number): Frequency[] => values
      .map((count, number) => ({
        number: String(number).padStart(width, "0"),
        count,
        share: draws ? count / draws : null,
      }))
      .sort((a, b) => b.count - a.count || a.number.localeCompare(b.number));

    return {
      lottery,
      position,
      selectedYears: years,
      availableYears: [...new Set(rows.map((row) => row.year))].sort(),
      draws,
      status: rows.length === 0 ? "ไม่มีข้อมูลในปีที่เลือก" : draws === 0 ? "ไม่มีงวดจริง" : "มีข้อมูล",
      // A missing dataset has no distribution. A present year without draws has real zero counts.
      numbers: rows.length ? frequencies(counts, 2) : [],
      digits: rows.length ? [
        { place: "หลักสิบ", frequencies: frequencies(tens, 1) },
        { place: "หลักหน่วย", frequencies: frequencies(units, 1) },
      ] : [],
    };
  });
}
