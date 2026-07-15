import './style.css';
import { loadAll } from './data.js';
import { createRiskRenderer } from './riskRenderer.js';
import { createRainRenderer } from './rainRenderer.js';
import { createMap } from './map.js';
import { createTimeControl } from './timeControl.js';
import { createChart } from './chart.js';
import { buildLegend } from './legend.js';

const data = await loadAll();

const riskR = createRiskRenderer(data);
const rainR = createRainRenderer(data);

const bbox = {
  west: data.gridMeta.bounds.west,
  east: data.gridMeta.bounds.east,
  north: data.gridMeta.bounds.north,
  south: data.gridMeta.bounds.south
};
const { setVisible } = createMap({
  bbox, riskR, rainR,
  provinces: data.provinces,
  regionMask: data.regionMask
});

buildLegend();

let chart; // khởi tạo sau timeControl (cần onSeek)
const timeCtl = createTimeControl(data, (t, frame) => {
  riskR.render(t);
  rainR.render(t);
  chart?.setCursor(frame);
});
chart = createChart(data, (frame) => { timeCtl.setPlaying(false); timeCtl.setFrame(frame); });
chart.setCursor(timeCtl.frame);

// Toggle layers
const toggles = [
  ['lyr-risk', 'lyr-risk'],
  ['lyr-rain', 'lyr-rain'],
  ['lyr-sus', 'lyr-sus'],
  ['lyr-hs', 'lyr-hs'],
  ['lyr-prov', 'lyr-prov']
];
for (const [cbId, layerId] of toggles) {
  const cb = document.getElementById(cbId);
  cb.addEventListener('change', () => {
    setVisible(layerId, cb.checked);
    if (layerId === 'lyr-prov') setVisible('prov-labels', cb.checked);
  });
}
