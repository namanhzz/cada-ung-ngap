// Tiện ích Web Mercator (EPSG:3857) ↔ WGS84 trên lưới pixel z cố định.
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/** Kinh độ → toạ độ pixel-x toàn cầu tại zoom z (tileSize 256). */
export function lonToPx(lon, z) {
  return ((lon + 180) / 360) * 256 * Math.pow(2, z);
}
/** Vĩ độ → toạ độ pixel-y toàn cầu tại zoom z. */
export function latToPx(lat, z) {
  const s = Math.sin(lat * D2R);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * Math.pow(2, z);
}
export function pxToLon(px, z) {
  return (px / (256 * Math.pow(2, z))) * 360 - 180;
}
export function pxToLat(py, z) {
  const n = Math.PI - (2 * Math.PI * py) / (256 * Math.pow(2, z));
  return R2D * Math.atan(Math.sinh(n));
}
/** Kích thước pixel thực địa (m) theo hướng E-W tại vĩ độ lat, zoom z. */
export function metersPerPixel(lat, z) {
  return (40075016.686 * Math.cos(lat * D2R)) / (256 * Math.pow(2, z));
}
