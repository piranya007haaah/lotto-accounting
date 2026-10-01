import { analyzeLabGroup, labKey, type LabGroup, type LabOptions } from './lab-all';
import type { MonthEntry } from './month-window';
type Request = { type: 'batch' | 'detail'; entries: (MonthEntry & LabGroup)[]; groups: LabGroup[]; options: LabOptions; id: number };
self.onmessage = async (event: MessageEvent<Request>) => {
  const { type, entries, groups, options, id } = event.data;
  const grouped = new Map<string, MonthEntry[]>();
  for (const e of entries) { const key = labKey(e), list = grouped.get(key) ?? []; list.push(e); grouped.set(key, list); }
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    try {
      const report = analyzeLabGroup(grouped.get(labKey(group)) ?? [], group, options);
      self.postMessage({ id, type, group, ...(type === 'detail' ? { report } : { summary: report.summary }), done: i + 1, total: groups.length });
    } catch (e) { self.postMessage({ id, type, group, error: e instanceof Error ? e.message : String(e), done: i + 1, total: groups.length }); }
    await new Promise(resolve => setTimeout(resolve, 0));
  }
};
