// Thanh thời gian: slider + play/pause + tốc độ. Hiển thị giờ Việt Nam (UTC+7).

const SPEEDS = [1, 2, 4];
const TICK_MS = 130; // ~7.7 fps cơ bản

export function createTimeControl(data, onFrame) {
  const slider = document.getElementById('time-slider');
  const btnPlay = document.getElementById('btn-play');
  const btnSpeed = document.getElementById('btn-speed');
  const label = document.getElementById('time-label');

  slider.max = String(data.animSteps - 1);
  let frame = 0;           // 0..animSteps-1 (offset animStart trong series)
  let playing = false;
  let speedIdx = 0;
  let timer = null;

  const fmt = new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
    timeZone: 'Asia/Ho_Chi_Minh'
  });

  function apply() {
    const t = data.animStart + frame;
    slider.value = String(frame);
    label.textContent = fmt.format(new Date(data.rainMeta.timesUtc[t])) + ' (GMT+7)';
    onFrame(t, frame);
  }

  function setFrame(f) {
    frame = Math.max(0, Math.min(data.animSteps - 1, f));
    apply();
  }

  function tick() {
    frame += SPEEDS[speedIdx];
    if (frame >= data.animSteps) frame = 0; // lặp lại
    apply();
  }

  function setPlaying(p) {
    playing = p;
    btnPlay.textContent = playing ? '⏸' : '▶';
    if (timer) { clearInterval(timer); timer = null; }
    if (playing) timer = setInterval(tick, TICK_MS);
  }

  btnPlay.addEventListener('click', () => setPlaying(!playing));
  btnSpeed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % SPEEDS.length;
    btnSpeed.textContent = '×' + SPEEDS[speedIdx];
  });
  slider.addEventListener('input', () => { setPlaying(false); setFrame(+slider.value); });

  apply();
  return { setFrame, setPlaying, get frame() { return frame; } };
}
