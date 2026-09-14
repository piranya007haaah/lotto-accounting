/** Supabase already retries 503/520/network failures; cover gateway 502/504 too.
 * Only reads may be replayed. Never retry a write after an uncertain response.
 */
export async function databaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const url = new URL(request?.url ?? String(input));
  if (!url.pathname.startsWith("/rest/v1/") || (method !== "GET" && method !== "HEAD")) {
    return fetch(input, init);
  }

  const callerSignal = init?.signal ?? request?.signal;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timeout = AbortSignal.timeout(8_000);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    try {
      const response = await fetch(input, { ...init, signal });
      if (attempt === 0 && (response.status === 502 || response.status === 504) && !callerSignal?.aborted) {
        await response.body?.cancel();
        continue;
      }
      return response;
    } catch (error) {
      if (callerSignal?.aborted) throw error;
      if (!timeout.aborted) throw error; // Supabase owns ordinary network retries.
      if (attempt === 0) continue;
      // AbortError prevents the SDK from adding another retry cycle after our deadline.
      throw new DOMException("ฐานข้อมูลตอบช้า กรุณาลองใหม่", "AbortError");
    }
  }
  throw new Error("Database read did not complete");
}
