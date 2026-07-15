// Tải dữ liệu mưa PDIR-Now hourly (.bin.gz) từ CHRS/UC Irvine cho sự kiện bão Yagi.
// Resumable: file đã có (kích thước > 0) sẽ được bỏ qua.
import { mkdirSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { CONFIG, p } from './lib/paths.mjs';
import { fetchBuffer, mapLimit } from './lib/fetchutil.mjs';

const { rain } = CONFIG;
const OUT_DIR = p('data', 'raw', 'rain');
mkdirSync(OUT_DIR, { recursive: true });

/** Danh sách mốc giờ UTC từ fetchStart→fetchEnd. */
function hourlyTimestamps() {
  const out = [];
  const end = Date.parse(rain.fetchEndUtc);
  for (let t = Date.parse(rain.fetchStartUtc); t <= end; t += 3600_000) out.push(new Date(t));
  return out;
}

/** Tên file PDIR-Now hourly: pdirnow1hYYMMDDHH.bin.gz */
function fileName(d) {
  const yy = String(d.getUTCFullYear()).slice(2);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  return `pdirnow1h${yy}${mm}${dd}${hh}.bin.gz`;
}

const stamps = hourlyTimestamps();
console.log(`Cần ${stamps.length} file hourly (${rain.fetchStartUtc} → ${rain.fetchEndUtc})`);

let done = 0, skipped = 0, missing = [];
await mapLimit(stamps, rain.concurrency, async (d) => {
  const name = fileName(d);
  const dest = p('data', 'raw', 'rain', name);
  if (existsSync(dest) && statSync(dest).size > 0) { skipped++; return; }
  const url = `${rain.baseUrl}/${d.getUTCFullYear()}/${name}`;
  const buf = await fetchBuffer(url, { retries: rain.retries });
  if (buf === null) { missing.push(name); console.warn(`  404: ${name}`); return; }
  writeFileSync(dest, buf);
  done++;
  if (done % 24 === 0) console.log(`  đã tải ${done + skipped}/${stamps.length}...`);
});

console.log(`Xong: tải mới ${done}, bỏ qua (đã có) ${skipped}, thiếu ${missing.length}`);
if (missing.length) {
  console.warn('File thiếu (server không có):', missing.join(', '));
  process.exitCode = missing.length > stamps.length * 0.05 ? 1 : 0;
}
