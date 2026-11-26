const ANSI = /\x1b\[[0-9;]*m/g;

export function stripAnsi(value) {
  return String(value).replace(ANSI, '');
}

export function visibleLength(value) {
  return [...stripAnsi(value)].length;
}

export function style(text, { color, bold, dim } = {}, enabled = true) {
  if (!text) return '';
  if (!enabled) return text;
  const codes = [];
  if (bold) codes.push('1');
  if (dim) codes.push('2');
  if (color) codes.push(String(color));
  if (!codes.length) return text;
  return `\x1b[${codes.join(';')}m${text}\x1b[0m`;
}

export function paint(spans, enabled) {
  let out = '';
  for (const span of spans) {
    out += style(span.text, span, enabled);
  }
  return out;
}
