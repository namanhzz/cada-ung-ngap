// Sparkline mưa trung bình vùng (mm/h) — 1 chuỗi, area chart, con trỏ thời gian,
// hover tooltip + click-to-seek.

export function createChart(data, onSeek) {
  const canvas = document.getElementById('rain-chart');
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  const series = data.rainMeta.arealMeanMmHr.slice(data.animStart);
  const n = series.length;
  const vmax = Math.max(...series, 0.1);

  let cssW = 0, cssH = 0;
  const PAD = { l: 4, r: 4, t: 12, b: 4 };
  let cursorFrame = 0;
  let hoverFrame = -1;

  const fmt = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false, timeZone: 'Asia/Ho_Chi_Minh'
  });

  function resize() {
    cssW = canvas.clientWidth || 300;
    cssH = canvas.clientHeight || 90;
    canvas.width = cssW * dpr; canvas.height = cssH * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  const xAt = (i) => PAD.l + (i / (n - 1)) * (cssW - PAD.l - PAD.r);
  const yAt = (v) => cssH - PAD.b - (v / vmax) * (cssH - PAD.t - PAD.b);
  const frameAt = (x) => Math.max(0, Math.min(n - 1, Math.round(((x - PAD.l) / (cssW - PAD.l - PAD.r)) * (n - 1))));

  function draw() {
    ctx.clearRect(0, 0, cssW, cssH);
    // vùng area
    ctx.beginPath();
    ctx.moveTo(xAt(0), yAt(0));
    for (let i = 0; i < n; i++) ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.lineTo(xAt(n - 1), cssH - PAD.b);
    ctx.lineTo(xAt(0), cssH - PAD.b);
    ctx.closePath();
    ctx.fillStyle = 'rgba(49,130,189,0.25)';
    ctx.fill();
    // đường
    ctx.beginPath();
    for (let i = 0; i < n; i++) i === 0 ? ctx.moveTo(xAt(i), yAt(series[i])) : ctx.lineTo(xAt(i), yAt(series[i]));
    ctx.strokeStyle = '#3182bd';
    ctx.lineWidth = 2;
    ctx.stroke();
    // con trỏ thời gian hiện tại
    const cx = xAt(cursorFrame);
    ctx.strokeStyle = '#d94801';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, PAD.t - 6); ctx.lineTo(cx, cssH - PAD.b); ctx.stroke();
    // hover
    const hf = hoverFrame >= 0 ? hoverFrame : cursorFrame;
    const hx = xAt(hf), hv = series[hf];
    if (hoverFrame >= 0) {
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(hx, PAD.t - 6); ctx.lineTo(hx, cssH - PAD.b); ctx.stroke();
    }
    // nhãn giá trị
    const label = `${fmt.format(new Date(data.rainMeta.timesUtc[data.animStart + hf]))} · ${hv.toFixed(2)} mm/h`;
    ctx.font = '10.5px system-ui';
    ctx.fillStyle = '#555';
    const tw = ctx.measureText(label).width;
    ctx.fillText(label, Math.max(2, Math.min(cssW - tw - 2, hx - tw / 2)), 9);
  }

  canvas.addEventListener('mousemove', (e) => {
    hoverFrame = frameAt(e.offsetX); draw();
  });
  canvas.addEventListener('mouseleave', () => { hoverFrame = -1; draw(); });
  canvas.addEventListener('click', (e) => onSeek(frameAt(e.offsetX)));
  window.addEventListener('resize', resize);
  resize();

  return {
    setCursor(frame) { cursorFrame = frame; draw(); }
  };
}
