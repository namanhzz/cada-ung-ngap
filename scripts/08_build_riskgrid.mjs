// Downsample susceptibility 10× (mean) → lưới thấp cho render nguy cơ động client-side.
// Output: web/public/data/susceptibility_lowres.bin (uint8, 255 = mask) + grid_meta.json
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { CONFIG, p } from './lib/paths.mjs';
import { pxToLat, pxToLon } from './lib/mercator.mjs';

const { canonicalGrid: G, risk } = CONFIG;
const W = G.width, H = G.height, TS = G.tileSize;
const F = risk.downsampleFactor; // 10
const outW = Math.ceil(W / F);   // 1792
const outH = Math.ceil(H / F);   // 1127

const out = new Uint8Array(outW * outH);
const sum = new Float64Array(outW);
const cnt = new Uint32Array(outW);
const msk = new Uint32Array(outW);

let rowOut = 0;
for (let ty = G.tileY0; ty <= G.tileY1; ty++) {
  const sus = readFileSync(p('data', 'derived', 'terrain', `sus_strip_${ty}.bin`));
  for (let r = 0; r < TS; r++) {
    const gy = (ty - G.tileY0) * TS + r;
    for (let c = 0; c < W; c++) {
      const v = sus[r * W + c];
      const oc = (c / F) | 0;
      if (v === 255) msk[oc]++;
      else { sum[oc] += v; cnt[oc]++; }
    }
    if ((gy + 1) % F === 0 || gy === H - 1) {
      // chốt 1 hàng output
      for (let oc = 0; oc < outW; oc++) {
        out[rowOut * outW + oc] =
          msk[oc] >= cnt[oc] ? 255 : Math.min(250, Math.round(sum[oc] / cnt[oc]));
        sum[oc] = 0; cnt[oc] = 0; msk[oc] = 0;
      }
      rowOut++;
    }
  }
}
if (rowOut !== outH) throw new Error(`Số hàng output lệch: ${rowOut} ≠ ${outH}`);

mkdirSync(p('web', 'public', 'data'), { recursive: true });
writeFileSync(p('web', 'public', 'data', 'susceptibility_lowres.bin'), out);

const meta = {
  width: outW,
  height: outH,
  susScale: 250,
  maskValue: 255,
  // Góc lưới chuẩn (mép ngoài) — lưới đều trong không gian mercator
  bounds: {
    west: pxToLon(G.tileX0 * TS, G.zoom),
    east: pxToLon((G.tileX1 + 1) * TS, G.zoom),
    north: pxToLat(G.tileY0 * TS, G.zoom),
    south: pxToLat((G.tileY1 + 1) * TS, G.zoom)
  },
  mercator: { zoom: G.zoom, px0: G.tileX0 * TS, py0: G.tileY0 * TS, pxPerCell: F },
  model: CONFIG.terrain.model,
  risk: CONFIG.risk
};
writeFileSync(p('web', 'public', 'data', 'grid_meta.json'), JSON.stringify(meta, null, 2));
console.log(`→ susceptibility_lowres.bin ${outW}×${outH} (${(out.length / 1e6).toFixed(1)}MB)`);
