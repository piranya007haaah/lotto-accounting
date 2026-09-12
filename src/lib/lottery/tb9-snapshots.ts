import { canonicalSource, type Draw, type Selection } from "./tb9-fixed";
export type Snapshot = Selection & { data_version: string; generated_at: string; revision_id: string };
function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("lotto-tb9-experiment", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("snapshots", { keyPath: "revision_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function saveSnapshot(selection: Selection, rows: Draw[]): Promise<Snapshot> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalSource(rows, selection.target_month)));
  const data_version = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
  const snapshot: Snapshot = { ...selection, data_version, generated_at: new Date().toISOString(), revision_id: `${selection.target_month}:${data_version}` };
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readwrite"), store = tx.objectStore("snapshots");
    let saved = snapshot;
    const existing = store.get(snapshot.revision_id);
    existing.onsuccess = () => { if (existing.result) saved = existing.result; else store.add(snapshot); };
    tx.oncomplete = () => { db.close(); resolve(saved); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("บันทึก snapshot ไม่สำเร็จ")); };
  });
}
export async function listSnapshots(month: string): Promise<Snapshot[]> {
  const db = await openStore();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("snapshots", "readonly"), request = tx.objectStore("snapshots").getAll();
    tx.oncomplete = () => { db.close(); resolve((request.result as Snapshot[]).filter((s) => s.target_month === month).sort((a, b) => a.generated_at.localeCompare(b.generated_at))); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
