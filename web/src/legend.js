// Chú giải: 4 lớp nguy cơ + ramp mưa 24h.
import { RISK_COLORS, RISK_LABELS } from './riskRenderer.js';
import { rainColor } from './rainRenderer.js';

export function buildLegend() {
  const riskBox = document.getElementById('legend-risk');
  for (let i = 0; i < RISK_COLORS.length; i++) {
    const row = document.createElement('div');
    row.className = 'legend-row';
    const sw = document.createElement('span');
    sw.className = 'legend-swatch';
    sw.style.background = `rgb(${RISK_COLORS[i].join(',')})`;
    row.append(sw, document.createTextNode(RISK_LABELS[i]));
    riskBox.appendChild(row);
  }

  const rainBox = document.getElementById('legend-rain');
  const ramp = document.createElement('div');
  ramp.className = 'legend-ramp';
  const stops = [0, 10, 50, 100, 200, 400];
  ramp.style.background = `linear-gradient(to right, ${stops
    .map((mm, i) => {
      const [r, g, b, a] = rainColor(mm);
      return `rgba(${r},${g},${b},${(a / 255).toFixed(2)}) ${(i / (stops.length - 1)) * 100}%`;
    })
    .join(', ')})`;
  const labels = document.createElement('div');
  labels.className = 'legend-ramp-labels';
  labels.innerHTML = '<span>0</span><span>50</span><span>200</span><span>400+</span>';
  rainBox.append(ramp, labels);
}
