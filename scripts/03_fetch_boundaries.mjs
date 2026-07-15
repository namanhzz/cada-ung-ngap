// Lấy GeoJSON 34 tỉnh/thành SAU SÁP NHẬP 2025.
// Ưu tiên: file thủ công từ gis.vn (data/raw/boundaries/provinces_34_manual.geojson)
// — gis.vn không có link tải trực tiếp scriptable. Fallback: GitHub public mirrors.
import { mkdirSync, existsSync, copyFileSync, writeFileSync } from 'node:fs';
import { CONFIG, p } from './lib/paths.mjs';
import { fetchBuffer } from './lib/fetchutil.mjs';

const OUT = p('data', 'raw', 'boundaries', 'provinces_34.geojson');
mkdirSync(p('data', 'raw', 'boundaries'), { recursive: true });

const manual = p('data', 'raw', 'boundaries', 'provinces_34_manual.geojson');
if (existsSync(manual)) {
  copyFileSync(manual, OUT);
  console.log('Dùng file thủ công (gis.vn):', manual);
  process.exit(0);
}

const sources = [
  'https://raw.githubusercontent.com/nguyenduy1133/Free-GIS-Data/main/' +
    encodeURIComponent('Vietnam Administrative Divisions (Post-2025) - Đơn vị hành chính Việt Nam (Từ 2025)') +
    '/Provinces.geojson',
  ...CONFIG.boundaries.fallbackUrls
];

for (const url of sources) {
  try {
    console.log('Thử tải:', url);
    const buf = await fetchBuffer(url, { retries: 2, timeoutMs: 120000 });
    if (!buf) continue;
    const j = JSON.parse(buf.toString('utf8'));
    if (j.type !== 'FeatureCollection' || !Array.isArray(j.features) || j.features.length < 30) {
      console.warn('  Không hợp lệ / thiếu tỉnh, bỏ qua'); continue;
    }
    writeFileSync(OUT, buf);
    console.log(`OK: ${j.features.length} tỉnh/thành → ${OUT}`);
    process.exit(0);
  } catch (e) {
    console.warn('  Lỗi:', e.message);
  }
}
console.error('Không tải được ranh giới từ nguồn nào. Tải thủ công từ gis.vn và đặt vào:', manual);
process.exit(1);
