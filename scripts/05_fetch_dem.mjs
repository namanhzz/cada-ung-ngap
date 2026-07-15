// Chuẩn bị DEM trên lưới chuẩn (Web Mercator z12) dưới dạng strip int16.
// Output: data/derived/dem/strip_{ty}.bin — mỗi strip 17920 × 256 int16 (m), ty = tileY0..tileY1
//
// Nguồn ưu tiên: GeoTIFF quốc gia từ gis.vn (tải thủ công → data/raw/dem/vn_dem30m.tif)
// Fallback tự động: AWS terrarium tiles (elevation-tiles-prod, gốc NASA SRTMGL1, không cần auth)
import { mkdirSync, existsSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { CONFIG, p } from './lib/paths.mjs';
import { fetchBuffer, mapLimit } from './lib/fetchutil.mjs';
import { pxToLat, pxToLon } from './lib/mercator.mjs';

const { canonicalGrid: G, dem } = CONFIG;
const W = G.width;                       // 17920
const STRIP_H = G.tileSize;              // 256
const nTilesX = G.tileX1 - G.tileX0 + 1; // 70
const nTilesY = G.tileY1 - G.tileY0 + 1; // 44

mkdirSync(p('data', 'derived', 'dem'), { recursive: true });
const stripPath = (ty) => p('data', 'derived', 'dem', `strip_${ty}.bin`);

const manualTif = p(...dem.manualTifPath.split('/'));

if (existsSync(manualTif)) {
  await buildFromGeoTiff(manualTif);
} else {
  console.log('Không thấy GeoTIFF gis.vn tại', manualTif);
  console.log('→ Dùng fallback: AWS terrarium tiles (NASA SRTMGL1, z12)');
  await buildFromTerrarium();
}

// ================= gis.vn GeoTIFF (WGS84 1-arc-second) =================
async function buildFromGeoTiff(tifPath) {
  console.log('Dùng DEM gis.vn:', tifPath, `(${(statSync(tifPath).size / 1e9).toFixed(2)}GB)`);
  const { fromFile } = await import('geotiff');
  const tif = await fromFile(tifPath);
  const img = await tif.getImage();
  const [ox, oy] = img.getOrigin();          // góc trên-trái (lon, lat)
  const [rx, ry] = img.getResolution();      // độ/pixel (ry âm)
  const srcW = img.getWidth(), srcH = img.getHeight();
  console.log(`GeoTIFF: ${srcW}×${srcH}, origin (${ox.toFixed(4)}, ${oy.toFixed(4)}), res (${rx.toExponential(3)}, ${ry.toExponential(3)})`);

  for (let t = 0; t < nTilesY; t++) {
    const ty = G.tileY0 + t;
    if (existsSync(stripPath(ty))) { console.log(`  strip ${ty} đã có, bỏ qua`); continue; }
    const pyTop = ty * STRIP_H, pyBot = (ty + 1) * STRIP_H;
    const latTop = pxToLat(pyTop, G.zoom), latBot = pxToLat(pyBot, G.zoom);
    // Cửa sổ nguồn WGS84 phủ strip + đệm 2px
    const sx0 = Math.max(0, Math.floor((CONFIG.bbox.west - ox) / rx) - 2);
    const sx1 = Math.min(srcW, Math.ceil((CONFIG.bbox.east - ox) / rx) + 2);
    const sy0 = Math.max(0, Math.floor((latTop - oy) / ry) - 2);
    const sy1 = Math.min(srcH, Math.ceil((latBot - oy) / ry) + 2);
    const winW = sx1 - sx0;
    const [win] = await img.readRasters({ window: [sx0, sy0, sx1, sy1], samples: [0] });

    const strip = new Int16Array(W * STRIP_H);
    for (let r = 0; r < STRIP_H; r++) {
      const lat = pxToLat(pyTop + r + 0.5, G.zoom);
      const fy = (lat - oy) / ry - sy0 - 0.5;
      const y0 = Math.max(0, Math.min(sy1 - sy0 - 2, Math.floor(fy)));
      const wy = Math.min(1, Math.max(0, fy - y0));
      for (let c = 0; c < W; c++) {
        const lon = pxToLon(G.tileX0 * STRIP_H + c + 0.5, G.zoom);
        const fx = (lon - ox) / rx - sx0 - 0.5;
        const x0 = Math.max(0, Math.min(winW - 2, Math.floor(fx)));
        const wx = Math.min(1, Math.max(0, fx - x0));
        const v00 = win[y0 * winW + x0], v01 = win[y0 * winW + x0 + 1];
        const v10 = win[(y0 + 1) * winW + x0], v11 = win[(y0 + 1) * winW + x0 + 1];
        // nodata (thường -32768) lan truyền qua bilinear → giữ nguyên nếu bất kỳ góc nào nodata
        if (v00 <= -30000 || v01 <= -30000 || v10 <= -30000 || v11 <= -30000) {
          strip[r * W + c] = -32768;
        } else {
          strip[r * W + c] = Math.round(
            v00 * (1 - wx) * (1 - wy) + v01 * wx * (1 - wy) + v10 * (1 - wx) * wy + v11 * wx * wy
          );
        }
      }
    }
    writeFileSync(stripPath(ty), Buffer.from(strip.buffer));
    console.log(`  strip ${ty} (${t + 1}/${nTilesY}) — lat ${latBot.toFixed(3)}..${latTop.toFixed(3)}`);
  }
  console.log('Xong DEM từ GeoTIFF gis.vn.');
}

// ================= AWS terrarium fallback =================
async function buildFromTerrarium() {
  const rawDir = p('data', 'raw', 'dem', 'terrarium');
  mkdirSync(rawDir, { recursive: true });

  // Tải theo hàng tile để ghép strip ngay, resume theo strip
  for (let t = 0; t < nTilesY; t++) {
    const ty = G.tileY0 + t;
    if (existsSync(stripPath(ty))) { console.log(`  strip ${ty} đã có, bỏ qua`); continue; }

    const xs = Array.from({ length: nTilesX }, (_, i) => G.tileX0 + i);
    const tiles = await mapLimit(xs, dem.concurrency, async (tx) => {
      const cache = p('data', 'raw', 'dem', 'terrarium', `${tx}_${ty}.png`);
      let buf;
      if (existsSync(cache) && statSync(cache).size > 0) {
        buf = readFileSync(cache);
      } else {
        const url = dem.terrariumUrl.replace('{z}', G.zoom).replace('{x}', tx).replace('{y}', ty);
        buf = await fetchBuffer(url, { retries: 3 });
        if (!buf) return null; // ngoài phạm vi dữ liệu (hiếm)
        writeFileSync(cache, buf);
      }
      const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
      if (info.width !== 256 || info.height !== 256) throw new Error(`Tile ${tx}/${ty} kích thước lạ`);
      return { tx, data, channels: info.channels };
    });

    const strip = new Int16Array(W * STRIP_H).fill(-32768);
    for (const tile of tiles) {
      if (!tile) continue;
      const xOff = (tile.tx - G.tileX0) * 256;
      const ch = tile.channels;
      for (let r = 0; r < 256; r++) {
        for (let c = 0; c < 256; c++) {
          const o = (r * 256 + c) * ch;
          // terrarium: elev = R*256 + G + B/256 − 32768
          const elev = tile.data[o] * 256 + tile.data[o + 1] + tile.data[o + 2] / 256 - 32768;
          strip[r * W + xOff + c] = Math.round(elev);
        }
      }
    }
    writeFileSync(stripPath(ty), Buffer.from(strip.buffer));
    console.log(`  strip ${ty} (${t + 1}/${nTilesY}) hoàn tất`);
  }
  console.log('Xong DEM từ terrarium.');
}
