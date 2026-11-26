function spanLength(spans) {
  return spans.reduce((sum, span) => sum + [...span.text].length, 0);
}

export function truncateSpans(spans, max, ascii) {
  const total = spanLength(spans);
  if (total <= max) return spans;
  const ell = ascii ? '...' : '…';
  const ellLen = [...ell].length;
  if (max <= ellLen) {
    const flat = spans.map((span) => span.text).join('');
    return [{ text: [...flat].slice(0, max).join(''), color: spans[0]?.color }];
  }
  let keep = max - ellLen;
  const result = [];
  for (const span of spans) {
    if (keep <= 0) break;
    const chars = [...span.text];
    if (chars.length <= keep) {
      result.push(span);
      keep -= chars.length;
    } else {
      result.push({ ...span, text: `${chars.slice(0, keep).join('')}${ell}` });
      keep = 0;
    }
  }
  return result;
}

export function layoutLine(parts, width, { sep = ' · ', sepColor = '90', ascii = false } = {}) {
  const items = parts.filter((part) => part && spanLength(part.spans || []) > 0);
  if (!items.length) return [];
  let active = items.slice();
  const lengthOf = (list) => {
    if (!list.length) return 0;
    return list.reduce((sum, part) => sum + spanLength(part.spans), 0) + sep.length * (list.length - 1);
  };
  const dropOrder = [...items].sort((a, b) => a.priority - b.priority);
  for (const part of dropOrder) {
    if (lengthOf(active) <= width) break;
    if (part.keep) continue;
    active = active.filter((item) => item !== part);
  }
  if (!active.length) active = [items[0]];
  if (lengthOf(active) > width) {
    const last = active[active.length - 1];
    const prefix = active.length === 1 ? 0 : lengthOf(active.slice(0, -1)) + sep.length;
    const budget = Math.max(1, width - prefix);
    active = [
      ...active.slice(0, -1),
      { ...last, spans: truncateSpans(last.spans, budget, ascii) },
    ];
  }
  const spans = [];
  active.forEach((part, index) => {
    if (index) spans.push({ text: sep, color: sepColor });
    spans.push(...part.spans);
  });
  if (spanLength(spans) > width) return truncateSpans(spans, width, ascii);
  return spans;
}
