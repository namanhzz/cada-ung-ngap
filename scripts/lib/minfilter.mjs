// Min-filter trượt 1 chiều O(n) (thuật toán van Herk / Gil-Werman) trên Int16Array/Float32Array.
// window = 2*radius + 1. Dùng 2 lượt (ngang + dọc) để có min-filter vuông 2D tách được.

/**
 * Min-filter 1D trên mỗi hàng của mảng 2D (rowMajor width×height), ghi vào out.
 */
export function minFilterRows(src, out, width, height, radius) {
  const win = 2 * radius + 1;
  const g = new Float64Array(width);
  const h = new Float64Array(width);
  for (let r = 0; r < height; r++) {
    const off = r * width;
    // g: min tích luỹ trái→phải reset mỗi block; h: phải→trái
    for (let i = 0; i < width; i++) {
      const v = src[off + i];
      g[i] = i % win === 0 ? v : Math.min(g[i - 1], v);
    }
    for (let i = width - 1; i >= 0; i--) {
      const v = src[off + i];
      h[i] = (i % win === win - 1 || i === width - 1) ? v : Math.min(h[i + 1], v);
    }
    for (let i = 0; i < width; i++) {
      const lo = i - radius, hi = i + radius;
      let m;
      if (lo < 0) m = g[Math.min(hi, width - 1)];
      else if (hi >= width) m = h[lo];
      else m = Math.min(h[lo], g[hi]);
      out[off + i] = m;
    }
  }
}

/**
 * Min-filter 1D theo cột (dọc) — src/out rowMajor width×height.
 * Xử lý theo khối cột để thân thiện cache.
 */
export function minFilterCols(src, out, width, height, radius) {
  const win = 2 * radius + 1;
  const BLK = 512;
  const g = new Float64Array(height);
  const h = new Float64Array(height);
  for (let c0 = 0; c0 < width; c0 += BLK) {
    const c1 = Math.min(width, c0 + BLK);
    for (let c = c0; c < c1; c++) {
      for (let i = 0; i < height; i++) {
        const v = src[i * width + c];
        g[i] = i % win === 0 ? v : Math.min(g[i - 1], v);
      }
      for (let i = height - 1; i >= 0; i--) {
        const v = src[i * width + c];
        h[i] = (i % win === win - 1 || i === height - 1) ? v : Math.min(h[i + 1], v);
      }
      for (let i = 0; i < height; i++) {
        const lo = i - radius, hi = i + radius;
        let m;
        if (lo < 0) m = g[Math.min(hi, height - 1)];
        else if (hi >= height) m = h[lo];
        else m = Math.min(h[lo], g[hi]);
        out[i * width + c] = m;
      }
    }
  }
}
