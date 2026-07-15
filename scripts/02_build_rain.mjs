// Gộp các file PDIR-Now hourly đã tải → crop miền Bắc → 1 blob nhị phân cho frontend.
// Output:
//   web/public/data/rain_1h.bin   — uint16 LE, [timesteps][rows][cols], đơn vị mm/hr ×100
//   web/public/data/rain_meta.json — georef lưới, mốc thời gian, chuỗi mưa trung bình vùng
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { CONFIG, p } from './lib/paths.mjs';

const { rain } = CONFIG;
const { globalGrid: G, crop: C } = rain;
const nRows = C.rowEnd - C.rowStart + 1;   // 88
const nCols = C.colEnd - C.colStart + 1;   // 153
const cellsPerStep = nRows * nCols;

function hourlyTimestamps() {
  const out = [];
  const end = Date.parse(rain.fetchEndUtc);
  for (let t = Date.parse(rain.fetchStartUtc); t <= end; t += 3600_000) out.push(new Date(t));
  return out;
}
function fileName(d) {
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `pdirnow1h${yy}${mm}${dd}${hh}.bin.gz`;
}

const stamps = hourlyTimestamps();
const out = new Uint16Array(stamps.length * cellsPerStep);
const arealMean = new Array(stamps.length).fill(0);
let missingSteps = 0;

for (let t = 0; t < stamps.length; t++) {
  const file = p('data', 'raw', 'rain', fileName(stamps[t]));
  if (!existsSync(file)) {
    // Giờ thiếu: giữ 0 (không mưa) — đã cảnh báo ở bước fetch
    missingSteps++;
    continue;
  }
  const raw = gunzipSync(readFileSync(file));
  if (raw.length !== G.cols * G.rows * 2) {
    throw new Error(`${file}: kích thước sai ${raw.length}`);
  }
  const grid = new Int16Array(raw.buffer, raw.byteOffset, G.cols * G.rows);
  if (!rain.littleEndian) throw new Error('Chưa hỗ trợ big-endian (đặt littleEndian=true)');

  let sum = 0, n = 0;
  for (let r = 0; r < nRows; r++) {
    const srcOff = (C.rowStart + r) * G.cols + C.colStart;
    const dstOff = t * cellsPerStep + r * nCols;
    for (let c = 0; c < nCols; c++) {
      const v = grid[srcOff + c];
      const mmHrX100 = v > 0 ? v : 0; // nodata (âm) & 0 → 0
      out[dstOff + c] = mmHrX100;
      sum += mmHrX100; n++;
    }
  }
  arealMean[t] = +(sum / n / rain.scaleDivisor).toFixed(3); // mm/hr trung bình vùng
  if (t % 48 === 0) console.log(`  xử lý ${t}/${stamps.length}...`);
}

if (missingSteps > 0) console.warn(`Cảnh báo: ${missingSteps} giờ thiếu dữ liệu (điền 0)`);

const outDir = p('web', 'public', 'data');
mkdirSync(outDir, { recursive: true });
writeFileSync(p('web', 'public', 'data', 'rain_1h.bin'), Buffer.from(out.buffer));

// Toạ độ mép ngoài của lưới crop (tâm cell ± cellDeg/2)
const north = G.row0CenterLat - (C.rowStart - 0.5) * G.cellDeg;
const south = G.row0CenterLat - (C.rowEnd + 0.5) * G.cellDeg;
const west = G.col0CenterLon + (C.colStart - 0.5) * G.cellDeg;
const east = G.col0CenterLon + (C.colEnd + 0.5) * G.cellDeg;

const meta = {
  source: 'PDIR-Now (CHRS, UC Irvine) — hourly, 0.04°',
  units: 'mm/hr × 100 (uint16 LE)',
  scaleDivisor: rain.scaleDivisor,
  rows: nRows, cols: nCols, timesteps: stamps.length,
  bounds: { west, south, east, north },
  cellDeg: G.cellDeg,
  timesUtc: stamps.map((d) => d.toISOString()),
  animStartUtc: rain.animStartUtc,
  arealMeanMmHr: arealMean
};
writeFileSync(p('web', 'public', 'data', 'rain_meta.json'), JSON.stringify(meta));

// ---- Sanity checks ----
let mx = 0; for (const v of out) if (v > mx) mx = v;
const peakIdx = arealMean.indexOf(Math.max(...arealMean));
console.log(`rain_1h.bin: ${stamps.length} bước × ${nRows}×${nCols} = ${(out.byteLength / 1e6).toFixed(1)}MB`);
console.log(`Max cường độ: ${(mx / rain.scaleDivisor).toFixed(1)} mm/hr (kỳ vọng ≤ ~120)`);
console.log(`Đỉnh mưa trung bình vùng: ${arealMean[peakIdx]} mm/hr lúc ${stamps[peakIdx].toISOString()} (kỳ vọng 7–9/9)`);
