import { analyzeMonthWindows, type WindowOptions } from "./month-window";
self.onmessage = (event: MessageEvent<WindowOptions>) => {
  try { self.postMessage({ result: analyzeMonthWindows(event.data) }); }
  catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "คำนวณไม่สำเร็จ" }); }
};
