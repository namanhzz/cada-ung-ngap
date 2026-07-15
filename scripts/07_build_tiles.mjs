// Cắt strip terrain thành slippy tiles PNG z12 + build pyramid z11→z7 bằng sharp.
// - Độ nhạy cảm: ramp YlGnBu (nước → trong suốt)
// - Hillshade: RGBA "shadows-only" (đen, alpha theo độ tối) — đè đẹp lên basemap
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import sharp from 'sharp';
import { CONFIG, p } from './lib/paths.mjs';
import { mapLimit } from './lib/fetchutil.mjs';

const { canonicalGrid: G, webTiles } = CONFIG;
const W = G.width, TS = G.tileSize;
const nTilesX = G.tileX1 - G.tileX0 + 1;

// Ramp Purples (ColorBrewer, 9 mốc) nội suy tuyến tính theo S∈[0,1]
// — tách biệt với lớp mưa (xanh dương) và lớp nguy cơ (YlOrRd)
const RAMP = [
  [252, 251, 253], [239, 237, 245], [218, 218, 235], [188, 189, 220], [158, 154, 200],
  [128, 125, 186], [106, 81, 163], [84, 39, 143], [63, 0, 125]
];
function rampColor(s) {
  const x = Math.max(0, Math.min(0.9999, s)) * (RAMP.length - 1);
  const i = Math.floor(x), f = x - i;
  return [
    Math.round(RAMP[i][0] + (RAMP[i + 1][0] - RAMP[i][0]) * f),
    Math.round(RAMP[i][1] + (RAMP[i + 1][1] - RAMP[i][1]) * f),
    Math.round(RAMP[i][2] + (RAMP[i + 1][2] - RAMP[i][2]) * f)
  ];
}
// LUT 256 mức cho nhanh
const LUT = new Uint8Array(256 * 3);
for (let v = 0; v <= 250; v++) {
  const [r, g, b] = rampColor(v / 250);
  LUT[v * 3] = r; LUT[v * 3 + 1] = g; LUT[v * 3 + 2] = b;
}

const susDir = p('web', 'public', 'tiles', 'susceptibility');
const hsDir = p('web', 'public', 'tiles', 'hillshade');

console.log('=== Cắt tiles z12 ===');
for (let ty = G.tileY0; ty <= G.tileY1; ty++) {
  const susBuf = readFileSync(p('data', 'derived', 'terrain', `sus_strip_${ty}.bin`));
  const hsBuf = readFileSync(p('data', 'derived', 'terrain', `hs_strip_${ty}.bin`));

  const jobs = [];
  for (let i = 0; i < nTilesX; i++) jobs.push(i);
  await mapLimit(jobs, 8, async (i) => {
    const tx = G.tileX0 + i;
    const susRGBA = Buffer.alloc(TS * TS * 4);
    const hsRGBA = Buffer.alloc(TS * TS * 4);
    for (let r = 0; r < TS; r++) {
      const src = r * W + i * TS;
      for (let c = 0; c < TS; c++) {
        const s = susBuf[src + c];
        const o = (r * TS + c) * 4;
        if (s === 255) {
          // nước/nodata → trong suốt
        } else {
          susRGBA[o] = LUT[s * 3]; susRGBA[o + 1] = LUT[s * 3 + 1]; susRGBA[o + 2] = LUT[s * 3 + 2];
          susRGBA[o + 3] = 255;
          const shade = hsBuf[src + c];
          hsRGBA[o + 3] = Math.round((255 - shade) * 0.75); // shadows-only
        }
      }
    }
    const sd = p('web', 'public', 'tiles', 'susceptibility', String(G.zoom), String(tx));
    const hd = p('web', 'public', 'tiles', 'hillshade', String(G.zoom), String(tx));
    mkdirSync(sd, { recursive: true });
    mkdirSync(hd, { recursive: true });
    await sharp(susRGBA, { raw: { width: TS, height: TS, channels: 4 } })
      .png({ palette: true, compressionLevel: 9 }).toFile(`${sd}\\${ty}.png`);
    await sharp(hsRGBA, { raw: { width: TS, height: TS, channels: 4 } })
      .png({ compressionLevel: 9 }).toFile(`${hd}\\${ty}.png`);
  });
  console.log(`  hàng tile ${ty} (${ty - G.tileY0 + 1}/${G.tileY1 - G.tileY0 + 1})`);
}

console.log('=== Build pyramid ===');
for (const layer of ['susceptibility', 'hillshade']) {
  for (let z = G.zoom - 1; z >= webTiles.minZoom; z--) {
    const x0 = Math.floor(G.tileX0 / Math.pow(2, G.zoom - z));
    const x1 = Math.floor(G.tileX1 / Math.pow(2, G.zoom - z));
    const y0 = Math.floor(G.tileY0 / Math.pow(2, G.zoom - z));
    const y1 = Math.floor(G.tileY1 / Math.pow(2, G.zoom - z));
    const jobs = [];
    for (let tx = x0; tx <= x1; tx++) for (let ty = y0; ty <= y1; ty++) jobs.push([tx, ty]);
    await mapLimit(jobs, 8, async ([tx, ty]) => {
      const children = [];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const cp = p('web', 'public', 'tiles', layer, String(z + 1), String(tx * 2 + dx), `${ty * 2 + dy}.png`);
        if (existsSync(cp)) {
          children.push({ input: cp, left: dx * TS, top: dy * TS });
        }
      }
      if (!children.length) return;
      const dir = p('web', 'public', 'tiles', layer, String(z), String(tx));
      mkdirSync(dir, { recursive: true });
      const composed = await sharp({
        create: { width: TS * 2, height: TS * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
      }).composite(children).png().toBuffer();
      const png = sharp(composed).resize(TS, TS).png({ compressionLevel: 9 });
      await (layer === 'susceptibility' ? png : png).toFile(`${dir}\\${ty}.png`);
    });
    console.log(`  ${layer} z${z}: ${(x1 - x0 + 1) * (y1 - y0 + 1)} tiles`);
  }
}
console.log('Xong tiles.');
