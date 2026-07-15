// Tải & chuẩn bị dữ liệu: mưa (uint16 blob), meta, lưới nhạy cảm lowres, prefix sums.

// Gốc URL tuyệt đối theo base của Vite (hỗ trợ deploy dưới subpath, vd GitHub Pages)
export const BASE = new URL(import.meta.env.BASE_URL, location.origin).href;

export async function loadAll() {
  const [rainBuf, rainMeta, gridMeta, susBuf, provinces, regionMask] = await Promise.all([
    fetch(`${BASE}data/rain_1h.bin`).then((r) => r.arrayBuffer()),
    fetch(`${BASE}data/rain_meta.json`).then((r) => r.json()),
    fetch(`${BASE}data/grid_meta.json`).then((r) => r.json()),
    fetch(`${BASE}data/susceptibility_lowres.bin`).then((r) => r.arrayBuffer()),
    fetch(`${BASE}data/provinces_34.geojson`).then((r) => r.json()),
    fetch(`${BASE}data/region_mask.geojson`).then((r) => r.json())
  ]);

  const rain = new Uint16Array(rainBuf);
  const sus = new Uint8Array(susBuf);
  const cells = rainMeta.rows * rainMeta.cols;
  const T = rainMeta.timesteps;

  // Prefix sum theo thời gian (mm): P[(t+1)*cells + c] = tổng mưa 0..t
  const prefix = new Float32Array((T + 1) * cells);
  for (let t = 0; t < T; t++) {
    const src = t * cells, a = t * cells, b = (t + 1) * cells;
    for (let c = 0; c < cells; c++) {
      prefix[b + c] = prefix[a + c] + rain[src + c] / rainMeta.scaleDivisor;
    }
  }

  /** Tổng mưa trượt `hours` giờ kết thúc tại bước t (mm), ghi vào out (cells). */
  function trailingSum(t, hours, out) {
    const t1 = (t + 1) * cells;
    const t0 = Math.max(0, t + 1 - hours) * cells;
    for (let c = 0; c < cells; c++) out[c] = prefix[t1 + c] - prefix[t0 + c];
    return out;
  }

  // Chỉ số bước bắt đầu animation (bão Yagi: 5/9 00:00 UTC)
  // So sánh theo epoch (chuỗi ISO có thể khác định dạng ms)
  const animStartMs = Date.parse(rainMeta.animStartUtc);
  const animStart = rainMeta.timesUtc.findIndex((s) => Date.parse(s) === animStartMs);

  return {
    rain, rainMeta, gridMeta, sus, provinces, regionMask,
    cells, T,
    animStart: animStart >= 0 ? animStart : 0,
    animSteps: T - (animStart >= 0 ? animStart : 0),
    trailingSum
  };
}
