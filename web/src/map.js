// Khởi tạo MapLibre: basemap OSM, tiles địa hình, canvas mưa + nguy cơ, ranh giới tỉnh.
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASE } from './data.js';

export function createMap({ bbox, riskR, rainR, provinces, regionMask }) {
  const map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        // Basemap nhạt, KHÔNG nhãn — để lớp mưa/nguy cơ nổi bật
        basemap: {
          type: 'raster',
          tiles: [
            'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
            'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
            'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'
          ],
          tileSize: 256,
          maxzoom: 19,
          attribution: '© CARTO © OpenStreetMap | Mưa: PDIR-Now (CHRS/UCI) | DEM: NASA SRTMGL1'
        }
      },
      layers: [
        // Nền cùng màu mask → kéo sát mép không lộ "hình chữ nhật"
        { id: 'bg', type: 'background', paint: { 'background-color': '#e9ecef' } },
        { id: 'basemap', type: 'raster', source: 'basemap' }
      ]
    },
    bounds: [[bbox.west, bbox.south], [bbox.east, bbox.north]],
    fitBoundsOptions: { padding: 20 },
    // Khoá trong phạm vi miền Bắc (đệm ~0.4°)
    maxBounds: [[bbox.west - 0.4, bbox.south - 0.4], [bbox.east + 0.4, bbox.north + 0.4]],
    minZoom: 6.2,
    maxZoom: 15
  });
  map.addControl(new maplibregl.NavigationControl(), 'top-left');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  const markers = [];

  map.on('load', () => {
    const tb = { west: bbox.west, south: bbox.south, east: bbox.east, north: bbox.north };

    // --- Độ nhạy cảm địa hình 30m (tiles tĩnh) ---
    map.addSource('susceptibility', {
      type: 'raster',
      tiles: [`${BASE}tiles/susceptibility/{z}/{x}/{y}.png`],
      tileSize: 256, minzoom: 7, maxzoom: 12,
      bounds: [tb.west, tb.south, tb.east, tb.north]
    });
    map.addLayer({
      id: 'lyr-sus', type: 'raster', source: 'susceptibility',
      paint: { 'raster-opacity': 0.72, 'raster-resampling': 'nearest' },
      layout: { visibility: 'none' }
    });

    // --- Bóng đổ địa hình ---
    map.addSource('hillshade', {
      type: 'raster',
      tiles: [`${BASE}tiles/hillshade/{z}/{x}/{y}.png`],
      tileSize: 256, minzoom: 7, maxzoom: 12,
      bounds: [tb.west, tb.south, tb.east, tb.north]
    });
    map.addLayer({ id: 'lyr-hs', type: 'raster', source: 'hillshade', paint: { 'raster-opacity': 0.55 } });

    // --- Mưa (canvas động) ---
    const rb = rainR.bounds;
    map.addSource('rain', {
      type: 'canvas', canvas: rainR.canvas, animate: true,
      coordinates: [[rb.west, rb.north], [rb.east, rb.north], [rb.east, rb.south], [rb.west, rb.south]]
    });
    map.addLayer({ id: 'lyr-rain', type: 'raster', source: 'rain', paint: { 'raster-opacity': 0.75, 'raster-fade-duration': 0 } });

    // --- Nguy cơ ngập (canvas động) ---
    const kb = riskR.bounds;
    map.addSource('risk', {
      type: 'canvas', canvas: riskR.canvas, animate: true,
      coordinates: [[kb.west, kb.north], [kb.east, kb.north], [kb.east, kb.south], [kb.west, kb.south]]
    });
    map.addLayer({ id: 'lyr-risk', type: 'raster', source: 'risk', paint: { 'raster-opacity': 0.9, 'raster-fade-duration': 0 } });

    // --- Mask: che ĐẶC mọi thứ ngoài các tỉnh miền Bắc (giấu mép raster) ---
    map.addSource('region-mask', { type: 'geojson', data: regionMask });
    map.addLayer({
      id: 'lyr-mask', type: 'fill', source: 'region-mask',
      paint: { 'fill-color': '#e9ecef', 'fill-opacity': 1 }
    });
    // Viền glow mềm quanh vùng nghiên cứu
    map.addLayer({
      id: 'lyr-mask-glow', type: 'line', source: 'region-mask',
      paint: { 'line-color': '#7d8ba1', 'line-width': 3, 'line-blur': 4, 'line-opacity': 0.6 }
    });

    // --- Ranh giới tỉnh ---
    map.addSource('provinces', { type: 'geojson', data: provinces });
    map.addLayer({
      id: 'lyr-prov', type: 'line', source: 'provinces',
      paint: { 'line-color': '#1d3557', 'line-width': 1.4, 'line-opacity': 0.85 }
    });

    // Nhãn tỉnh = HTML marker (đảm bảo dấu tiếng Việt, không cần glyph server)
    for (const f of provinces.features) {
      const el = document.createElement('div');
      el.className = 'prov-label';
      el.textContent = f.properties.TinhThanh ?? f.properties.name ?? '';
      const mk = new maplibregl.Marker({ element: el })
        .setLngLat([f.properties.label_lng, f.properties.label_lat])
        .addTo(map);
      markers.push(mk);
    }
  });

  /** Bật/tắt layer theo checkbox id. */
  function setVisible(layerId, visible) {
    if (layerId === 'prov-labels') {
      markers.forEach((m) => (m.getElement().style.display = visible ? '' : 'none'));
      return;
    }
    if (map.getLayer(layerId)) {
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
    }
  }

  return { map, setVisible };
}
