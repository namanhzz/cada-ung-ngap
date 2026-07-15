// Lớp mưa động: tổng 24h trượt (mm), ramp xanh dương, bán trong suốt.
// Canvas dựng với hàng cách đều trong MERCATOR (khớp canvas-source của MapLibre),
// bilinear-sample từ lưới mưa đều theo lat/lon.

const RAIN_STOPS = [
  //  mm,  r,   g,   b,  alpha — ramp đậm, đọc được ngay
  [0,    255, 255, 255, 0],
  [5,    198, 219, 239, 80],
  [25,   107, 174, 214, 150],
  [75,   49, 130, 189, 200],
  [150,  8, 81, 156, 225],
  [300,  8, 48, 107, 245],
  [500,  4, 20, 50, 255]
];
export function rainColor(mm) {
  if (mm <= 0) return [0, 0, 0, 0];
  let i = 1;
  while (i < RAIN_STOPS.length - 1 && RAIN_STOPS[i][0] < mm) i++;
  const a = RAIN_STOPS[i - 1], b = RAIN_STOPS[i];
  const f = Math.max(0, Math.min(1, (mm - a[0]) / (b[0] - a[0])));
  return [
    Math.round(a[1] + (b[1] - a[1]) * f),
    Math.round(a[2] + (b[2] - a[2]) * f),
    Math.round(a[3] + (b[3] - a[3]) * f),
    Math.round(a[4] + (b[4] - a[4]) * f)
  ];
}
export const RAIN_STOPS_EXPORT = RAIN_STOPS;

export function createRainRenderer(data) {
  const { rainMeta: rm } = data;
  const SCALE = 4; // 4 px canvas / cell mưa
  const W = rm.cols * SCALE, H = rm.rows * SCALE;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(W, H);
  const px = img.data;

  // Mép lưới mưa trong mercator-y (chuẩn hoá 0..1 toàn cầu)
  const mercY = (lat) => {
    const s = Math.sin((lat * Math.PI) / 180);
    return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI);
  };
  const yTop = mercY(rm.bounds.north), yBot = mercY(rm.bounds.south);

  // Precompute: hàng canvas → hàng mưa fractional
  const rowBase = new Int32Array(H), rowFrac = new Float32Array(H);
  for (let r = 0; r < H; r++) {
    const y = yTop + ((r + 0.5) / H) * (yBot - yTop);
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI * (1 - 2 * y)));
    // fractional theo tâm cell
    const fr = (rm.bounds.north - rm.cellDeg / 2 - lat) / rm.cellDeg;
    const cl = Math.max(0, Math.min(rm.rows - 2, Math.floor(fr)));
    rowBase[r] = cl; rowFrac[r] = Math.max(0, Math.min(1, fr - cl));
  }

  const r24 = new Float32Array(data.cells);

  function render(t) {
    data.trailingSum(t, 24, r24);
    const cols = rm.cols;
    let o = 0;
    for (let r = 0; r < H; r++) {
      const rb = rowBase[r], wy = rowFrac[r];
      const off0 = rb * cols, off1 = (rb + 1) * cols;
      for (let c = 0; c < W; c++, o += 4) {
        const fc = (c + 0.5) / SCALE - 0.5;
        const cb = Math.max(0, Math.min(cols - 2, Math.floor(fc)));
        const wx = Math.max(0, Math.min(1, fc - cb));
        const mm = (r24[off0 + cb] * (1 - wx) + r24[off0 + cb + 1] * wx) * (1 - wy)
                 + (r24[off1 + cb] * (1 - wx) + r24[off1 + cb + 1] * wx) * wy;
        const [cr, cg, cbl, ca] = rainColor(mm);
        px[o] = cr; px[o + 1] = cg; px[o + 2] = cbl; px[o + 3] = ca;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  return { canvas, render, bounds: rm.bounds };
}
