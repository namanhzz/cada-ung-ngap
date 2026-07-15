// Lọc tỉnh giao bbox miền Bắc, simplify bằng mapshaper, tính điểm đặt nhãn.
// Output: web/public/data/provinces_34.geojson
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import mapshaper from 'mapshaper';
import { CONFIG, p } from './lib/paths.mjs';

const { bbox, boundaries } = CONFIG;
const raw = JSON.parse(readFileSync(p('data', 'raw', 'boundaries', 'provinces_34.geojson'), 'utf8'));

// ---- Lọc feature giao bbox (kiểm tra bbox thô của geometry) ----
function geomBbox(geom) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const scan = (coords) => {
    if (typeof coords[0] === 'number') {
      if (coords[0] < w) w = coords[0];
      if (coords[0] > e) e = coords[0];
      if (coords[1] < s) s = coords[1];
      if (coords[1] > n) n = coords[1];
    } else coords.forEach(scan);
  };
  scan(geom.coordinates);
  return { w, s, e, n };
}

const filtered = raw.features.filter((f) => {
  const b = geomBbox(f.geometry);
  return b.w < bbox.east && b.e > bbox.west && b.s < bbox.north && b.n > bbox.south;
});
console.log(`Tỉnh giao bbox miền Bắc: ${filtered.length}/${raw.features.length}`);
console.log('  ' + filtered.map((f) => f.properties.TinhThanh ?? f.properties.name).join(', '));

// ---- Simplify bằng mapshaper ----
const input = JSON.stringify({ type: 'FeatureCollection', features: filtered });
const cmd = `-i in.geojson -simplify ${boundaries.simplifyPercent}% keep-shapes -o precision=0.0001 out.geojson`;
const result = await mapshaper.applyCommands(cmd, { 'in.geojson': input });
const simplified = JSON.parse(result['out.geojson'].toString('utf8'));

// ---- Điểm đặt nhãn: centroid của polygon lớn nhất mỗi tỉnh ----
function ringArea(ring) {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return Math.abs(a / 2);
}
function ringCentroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const cross = ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    a += cross;
    cx += (ring[i][0] + ring[i + 1][0]) * cross;
    cy += (ring[i][1] + ring[i + 1][1]) * cross;
  }
  a /= 2;
  return a === 0 ? ring[0] : [cx / (6 * a), cy / (6 * a)];
}
for (const f of simplified.features) {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  let best = polys[0], bestArea = -1;
  for (const poly of polys) {
    const area = ringArea(poly[0]);
    if (area > bestArea) { bestArea = area; best = poly; }
  }
  const [lng, lat] = ringCentroid(best[0]);
  f.properties.label_lng = +lng.toFixed(5);
  f.properties.label_lat = +lat.toFixed(5);
}

mkdirSync(p('web', 'public', 'data'), { recursive: true });
const outPath = p('web', 'public', 'data', 'provinces_34.geojson');
writeFileSync(outPath, JSON.stringify(simplified));
console.log(`→ ${outPath} (${(JSON.stringify(simplified).length / 1e6).toFixed(2)}MB)`);

// ---- Mask: thế giới trừ vùng các tỉnh (dissolve) — che mờ ngoài miền Bắc ----
const dis = await mapshaper.applyCommands(
  '-i in.geojson -dissolve2 -o out.geojson',
  { 'in.geojson': JSON.stringify(simplified) }
);
const dissolved = JSON.parse(dis['out.geojson'].toString('utf8'));

// mapshaper có thể trả FeatureCollection hoặc GeometryCollection
const geoms = dissolved.type === 'GeometryCollection'
  ? dissolved.geometries
  : (dissolved.features ?? [dissolved]).map((f) => f.geometry ?? f);
const holes = [];
for (const g of geoms) {
  const polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
  for (const poly of polys) {
    const outer = poly[0];
    if (ringArea(outer) < 0.001) continue; // bỏ đảo nhỏ li ti cho nhẹ
    holes.push([...outer].reverse()); // đảo chiều → hole
  }
}
// Vòng ngoài phủ rộng quanh bbox (CCW)
const P = 15;
const world = [
  [bbox.west - P, bbox.south - P], [bbox.east + P, bbox.south - P],
  [bbox.east + P, bbox.north + P], [bbox.west - P, bbox.north + P],
  [bbox.west - P, bbox.south - P]
];
const mask = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [world, ...holes] } }]
};
const maskPath = p('web', 'public', 'data', 'region_mask.geojson');
writeFileSync(maskPath, JSON.stringify(mask));
console.log(`→ ${maskPath} (${holes.length} vùng, ${(JSON.stringify(mask).length / 1e3).toFixed(0)}KB)`);
