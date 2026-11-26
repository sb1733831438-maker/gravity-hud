export function meterColor(percent, { dangerHigh, theme }) {
  if (dangerHigh) {
    if (percent >= 85) return theme.bad;
    if (percent >= 60) return theme.warn;
    return theme.good;
  }
  if (percent <= 15) return theme.bad;
  if (percent <= 40) return theme.warn;
  return theme.good;
}

export function bar(percent, width, { ascii = false } = {}) {
  const w = Math.max(1, width | 0);
  const p = Math.min(100, Math.max(0, Number(percent) || 0));
  const exact = (p / 100) * w;
  let filled = Math.floor(exact);
  let frac = exact - filled;
  if (filled >= w) {
    filled = w;
    frac = 0;
  }
  const full = ascii ? '#' : '█';
  const empty = ascii ? '-' : '░';
  const partial = ascii ? (frac >= 0.5 ? '#' : '-') : frac >= 0.66 ? '▓' : frac >= 0.33 ? '▒' : '░';
  let out = '';
  for (let i = 0; i < w; i += 1) {
    if (i < filled) out += full;
    else if (i === filled && filled < w && frac >= (ascii ? 0.5 : 0.2)) out += partial;
    else out += empty;
  }
  if (p > 0 && filled === 0 && !out.includes(full)) {
    out = (ascii ? '#' : '▒') + out.slice(1);
  }
  return out;
}

export function barWidth(terminalWidth, configured) {
  const width = Math.max(20, terminalWidth | 0);
  if (Number.isFinite(configured) && configured > 0) {
    return Math.max(4, Math.min(20, configured | 0));
  }
  if (width >= 110) return 16;
  if (width >= 90) return 12;
  if (width >= 70) return 10;
  if (width >= 50) return 8;
  return 4;
}
