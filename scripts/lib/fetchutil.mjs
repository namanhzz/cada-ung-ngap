import { setTimeout as delay } from 'node:timers/promises';

/**
 * GET một URL với retry + backoff. Trả về Buffer, hoặc null nếu 404.
 * Ném lỗi nếu hết số lần thử.
 */
export async function fetchBuffer(url, { retries = 3, retryDelayMs = 500, timeoutMs = 60000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await delay(retryDelayMs * (attempt + 1));
    }
  }
  throw new Error(`Tải thất bại sau ${retries + 1} lần: ${url} — ${lastErr?.message}`);
}

/** Chạy tối đa `limit` promise đồng thời trên danh sách items. */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
