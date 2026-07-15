// Vẽ lớp nguy cơ ngập động: Risk = S(địa hình) × F(mưa 24h/72h), phân 4 lớp màu.
// Canvas ở lưới lowres (~355m, đều trong mercator) — bilinear-sample mưa 4km.

export const RISK_COLORS = [
  [254, 204, 92],  // Thấp
  [253, 141, 60],  // Trung bình
  [240, 59, 32],   // Cao
  [189, 0, 38]     // Rất cao
];
export const RISK_LABELS = ['Thấp', 'Trung bình', 'Cao', 'Rất cao'];

export function createRiskRenderer(data) {
  const { gridMeta: gm, rainMeta: rm, sus } = data;
  const W = gm.width, H = gm.height;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  const img = ctx.createImageData(W, H);
  const px = img.data;

  const { w24h, w72h, rainNorm24h, rainNorm72h, classBreaks } = gm.risk;

  // ---- Precompute ánh xạ lưới lowres (mercator) → lưới mưa (lat/lon) ----
  const zScale = 256 * Math.pow(2, gm.mercator.zoom);
  const rowBase = new Int32Array(H), rowFrac = new Float32Array(H);
  for (let r = 0; r < H; r++) {
    const py = gm.mercator.py0 + (r + 0.5) * gm.mercator.pxPerCell;
    const lat = (180 / Math.PI) * Math.atan(Math.sinh(Math.PI - (2 * Math.PI * py) / zScale));
    // hàng mưa (fractional): 0 tại tâm cell đầu (north − cellDeg/2)
    const fr = (rm.bounds.north - rm.cellDeg / 2 - lat) / rm.cellDeg;
    const cl = Math.max(0, Math.min(rm.rows - 2, Math.floor(fr)));
    rowBase[r] = cl; rowFrac[r] = Math.max(0, Math.min(1, fr - cl));
  }
  const colBase = new Int32Array(W), colFrac = new Float32Array(W);
  for (let c = 0; c < W; c++) {
    const pxm = gm.mercator.px0 + (c + 0.5) * gm.mercator.pxPerCell;
    const lon = (pxm / zScale) * 360 - 180;
    const fc = (lon - (rm.bounds.west + rm.cellDeg / 2)) / rm.cellDeg;
    const cl = Math.max(0, Math.min(rm.cols - 2, Math.floor(fc)));
    colBase[c] = cl; colFrac[c] = Math.max(0, Math.min(1, fc - cl));
  }

  const r24 = new Float32Array(data.cells);
  const r72 = new Float32Array(data.cells);
  const [b0, b1, b2, b3] = classBreaks;
  const ALPHA = 190;

  /** Vẽ frame tại bước dữ liệu t (chỉ số tuyệt đối trong rain series). */
  function render(t) {
    data.trailingSum(t, 24, r24);
    data.trailingSum(t, 72, r72);
    const cols = rm.cols;
    let o = 0;
    for (let r = 0; r < H; r++) {
      const rb = rowBase[r], wy = rowFrac[r];
      const rowOff0 = rb * cols, rowOff1 = (rb + 1) * cols;
      for (let c = 0; c < W; c++, o += 4) {
        const s = sus[r * W + c];
        if (s === gm.maskValue) { px[o + 3] = 0; continue; }
        const cb = colBase[c], wx = colFrac[c];
        // bilinear mưa
        const i00 = rowOff0 + cb, i10 = rowOff1 + cb;
        const v24 = (r24[i00] * (1 - wx) + r24[i00 + 1] * wx) * (1 - wy)
                  + (r24[i10] * (1 - wx) + r24[i10 + 1] * wx) * wy;
        const v72 = (r72[i00] * (1 - wx) + r72[i00 + 1] * wx) * (1 - wy)
                  + (r72[i10] * (1 - wx) + r72[i10 + 1] * wx) * wy;
        let F = w24h * (v24 / rainNorm24h) + w72h * (v72 / rainNorm72h);
        if (F > 1) F = 1;
        const risk = (s / gm.susScale) * F;
        let ci = -1;
        if (risk >= b3) ci = 3;
        else if (risk >= b2) ci = 2;
        else if (risk >= b1) ci = 1;
        else if (risk >= b0) ci = 0;
        if (ci < 0) { px[o + 3] = 0; continue; }
        const col = RISK_COLORS[ci];
        px[o] = col[0]; px[o + 1] = col[1]; px[o + 2] = col[2]; px[o + 3] = ALPHA;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  return { canvas, render, bounds: gm.bounds };
}
