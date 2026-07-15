// Tính độ nhạy cảm ngập (susceptibility) + hillshade từ DEM, xử lý theo strip + halo.
// Input : data/derived/dem/strip_{ty}.bin (int16, 17920×256)
// Output: data/derived/terrain/sus_strip_{ty}.bin (uint8: 0..250 = S×250, 255 = mask nước/nodata)
//         data/derived/terrain/hs_strip_{ty}.bin  (uint8 hillshade)
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, p } from './lib/paths.mjs';
import { minFilterRows, minFilterCols } from './lib/minfilter.mjs';
import { pxToLat, metersPerPixel } from './lib/mercator.mjs';

const { canonicalGrid: G, terrain } = CONFIG;
const W = G.width;
const STRIP_H = G.tileSize;       // 256
const HALO = terrain.haloRows;    // 64 ≥ minFilterRadiusPx 57
const WIN_H = STRIP_H + 2 * HALO; // 384
const R = terrain.minFilterRadiusPx;
const M = terrain.model;
const NODATA = -32768;

mkdirSync(p('data', 'derived', 'terrain'), { recursive: true });

const demPath = (ty) => p('data', 'derived', 'dem', `strip_${ty}.bin`);
const readStrip = (ty) => {
  if (ty < G.tileY0 || ty > G.tileY1 || !existsSync(demPath(ty))) return null;
  const buf = readFileSync(demPath(ty));
  return new Int16Array(buf.buffer, buf.byteOffset, W * STRIP_H);
};

// Hằng số hillshade
const zenith = (90 - terrain.hillshade.altitudeDeg) * Math.PI / 180;
// Đổi azimuth địa lý → góc toán học (ESRI): (360 − az + 90) mod 360
const azMath = ((360 - terrain.hillshade.azimuthDeg + 90) % 360) * Math.PI / 180;
const cosZ = Math.cos(zenith), sinZ = Math.sin(zenith);

let globalMax = -Infinity, globalMin = Infinity;

for (let ty = G.tileY0; ty <= G.tileY1; ty++) {
  const mid = readStrip(ty);
  if (!mid) throw new Error(`Thiếu DEM strip ${ty} — chạy npm run fetch:dem trước`);
  const above = readStrip(ty - 1);
  const below = readStrip(ty + 1);

  // Ghép cửa sổ 384 hàng: 64 hàng cuối strip trên + 256 giữa + 64 hàng đầu strip dưới
  // (thiếu hàng xóm → nhân bản mép)
  const elev = new Float32Array(W * WIN_H);
  for (let r = 0; r < HALO; r++) {
    const src = above ? above.subarray((STRIP_H - HALO + r) * W, (STRIP_H - HALO + r + 1) * W)
                      : mid.subarray(0, W);
    elev.set(src, r * W);
  }
  for (let r = 0; r < STRIP_H; r++) elev.set(mid.subarray(r * W, (r + 1) * W), (HALO + r) * W);
  for (let r = 0; r < HALO; r++) {
    const src = below ? below.subarray(r * W, (r + 1) * W)
                      : mid.subarray((STRIP_H - 1) * W, STRIP_H * W);
    elev.set(src, (HALO + STRIP_H + r) * W);
  }
  // nodata → +∞ cho min-filter (không kéo min xuống), mask riêng
  const elevForMin = new Float32Array(W * WIN_H);
  for (let i = 0; i < elev.length; i++) elevForMin[i] = elev[i] <= NODATA + 1 ? 30000 : elev[i];

  // Min-filter 2D tách được (ngang rồi dọc)
  const tmp = new Float32Array(W * WIN_H);
  const localMin = new Float32Array(W * WIN_H);
  minFilterRows(elevForMin, tmp, W, WIN_H, R);
  minFilterCols(tmp, localMin, W, WIN_H, R);

  const sus = new Uint8Array(W * STRIP_H);
  const hs = new Uint8Array(W * STRIP_H);
  const pyTop = ty * STRIP_H;

  for (let r = 0; r < STRIP_H; r++) {
    const wr = HALO + r; // hàng trong cửa sổ
    const lat = pxToLat(pyTop + r + 0.5, G.zoom);
    const cell = metersPerPixel(lat, G.zoom); // mercator conformal: dx = dy
    const inv8 = 1 / (8 * cell);
    for (let c = 0; c < W; c++) {
      const i = wr * W + c;
      const v = elev[i];
      const o = r * W + c;
      if (v <= NODATA + 1 || v <= 0) { sus[o] = 255; hs[o] = 180; continue; } // nước/nodata

      if (v > globalMax) globalMax = v;
      if (v < globalMin) globalMin = v;

      // Horn 3×3 (clamp mép ngang)
      const cl = c > 0 ? c - 1 : c, cr = c < W - 1 ? c + 1 : c;
      const a = elev[(wr - 1) * W + cl], b = elev[(wr - 1) * W + c], d = elev[(wr - 1) * W + cr];
      const f = elev[i - (c - cl)], g2 = elev[i + (cr - c)];
      const h1 = elev[(wr + 1) * W + cl], h2 = elev[(wr + 1) * W + c], h3 = elev[(wr + 1) * W + cr];
      const dzdx = ((d + 2 * g2 + h3) - (a + 2 * f + h1)) * inv8;
      const dzdy = ((h1 + 2 * h2 + h3) - (a + 2 * b + d)) * inv8;
      const slopeRad = Math.atan(Math.sqrt(dzdx * dzdx + dzdy * dzdy));

      // Hillshade Horn (ESRI)
      const aspect = Math.atan2(dzdy, -dzdx);
      let shade = cosZ * Math.cos(slopeRad) + sinZ * Math.sin(slopeRad) * Math.cos(azMath - aspect);
      hs[o] = Math.max(0, Math.min(255, Math.round(shade * 255)));

      // Mô hình S
      const E = Math.max(0, Math.min(1, 1 - v / M.elevMax));
      const slopeDeg = slopeRad * 180 / Math.PI;
      const Sl = Math.max(0, Math.min(1, 1 - slopeDeg / M.slopeMaxDeg));
      const hand = v - localMin[i];
      const D = Math.max(0, Math.min(1, 1 - hand / M.handMax));
      const S = M.wElev * E + M.wSlope * Sl + M.wHand * D;
      sus[o] = Math.round(S * 250);
    }
  }

  writeFileSync(p('data', 'derived', 'terrain', `sus_strip_${ty}.bin`), sus);
  writeFileSync(p('data', 'derived', 'terrain', `hs_strip_${ty}.bin`), hs);
  console.log(`  strip ${ty} (${ty - G.tileY0 + 1}/${G.tileY1 - G.tileY0 + 1})`);
}

console.log(`Xong. Cao độ min/max trên đất: ${globalMin}m / ${globalMax}m (kỳ vọng max >3000m — Fansipan)`);
