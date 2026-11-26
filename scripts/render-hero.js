import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSample } from '../lib/preview.js';

const COLORS = {
  30: '#1c1c1c',
  31: '#e06c75',
  32: '#7dcea0',
  33: '#e5c07b',
  34: '#61afef',
  35: '#c678dd',
  36: '#56b6c2',
  37: '#d7dde6',
  90: '#8b95a7',
  91: '#ff6b6b',
  92: '#5ee0a0',
  93: '#f5d76e',
  94: '#7cb3ff',
  95: '#d2a8ff',
  96: '#7ee7f7',
  97: '#ffffff',
};

const FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, Liberation Mono, monospace';

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function parseAnsiSpans(line) {
  const spans = [];
  const re = /\x1b\[([0-9;]*)m/g;
  let color = '37';
  let bold = false;
  let dim = false;
  let index = 0;
  let match = re.exec(line);
  while (match) {
    if (match.index > index) spans.push({ text: line.slice(index, match.index), color, bold, dim });
    const codes = match[1] ? match[1].split(';') : ['0'];
    for (const code of codes) {
      if (code === '0' || code === '') {
        color = '37';
        bold = false;
        dim = false;
      } else if (code === '1') bold = true;
      else if (code === '2') dim = true;
      else if (code === '22') {
        bold = false;
        dim = false;
      } else if (/^(3|9)\d$/.test(code)) color = code;
    }
    index = match.index + match[0].length;
    match = re.exec(line);
  }
  if (index < line.length) spans.push({ text: line.slice(index), color, bold, dim });
  return spans.filter((span) => span.text);
}

function lineSvg(spans, y, x0, charW, size) {
  let x = x0;
  const parts = [];
  for (const span of spans) {
    const fill = COLORS[span.color] || COLORS[37];
    parts.push(
      `<tspan x="${x.toFixed(1)}" fill="${fill}" font-weight="${span.bold ? 700 : 400}" opacity="${span.dim ? 0.75 : 1}">${xml(span.text)}</tspan>`,
    );
    x += [...span.text].length * charW;
  }
  return `<text y="${y}" font-family="${FONT}" font-size="${size}">${parts.join('')}</text>`;
}

export function buildHeroSvg() {
  const width = 96;
  const compact = renderSample({ preset: 'compact', width, color: true, ascii: false, env: {} });
  const full = renderSample({ preset: 'full', width, color: true, ascii: false, env: {} });
  const sections = [
    { label: 'default', lines: compact.text.split('\n') },
    { label: 'full preset', lines: full.text.split('\n') },
  ];
  const charW = 8.7;
  const size = 15;
  const lineH = 24;
  const padX = 22;
  const chrome = 46;
  const longest = Math.max(
    ...sections.flatMap((section) => section.lines.map((line) => [...line.replace(/\x1b\[[0-9;]*m/g, '')].length)),
    24,
  );
  const inner = Math.ceil(longest * charW);
  const svgW = inner + padX * 2;
  const bodyRows = sections.reduce((sum, section) => sum + 1 + section.lines.length, 0);
  const svgH = chrome + 16 + bodyRows * lineH + 28;
  const body = [];
  let y = chrome + 28;
  for (const section of sections) {
    body.push(
      `<text x="${padX}" y="${y}" fill="#8b95a7" font-family="${FONT}" font-size="12">${xml(section.label)}</text>`,
    );
    y += lineH;
    for (const line of section.lines) {
      body.push(lineSvg(parseAnsiSpans(line), y, padX, charW, size));
      y += lineH;
    }
    y += 8;
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}" role="img">
  <title>gravity-hud preview</title>
  <desc>Status line rendered by gravity-hud from fixtures/session.json and fixtures/transcript.jsonl. The default preset is the first two lines. The full preset adds tools, subagents, todos, and cost.</desc>
  <rect width="${svgW}" height="${svgH}" rx="16" fill="#0e141b"/>
  <rect width="${svgW}" height="40" rx="16" fill="#121a24"/>
  <rect y="24" width="${svgW}" height="16" fill="#121a24"/>
  <circle cx="22" cy="20" r="6" fill="#ff5f57"/>
  <circle cx="42" cy="20" r="6" fill="#febc2e"/>
  <circle cx="62" cy="20" r="6" fill="#28c840"/>
  <text x="82" y="25" fill="#8b95a7" font-family="${FONT}" font-size="13">agy  ·  gravity-hud</text>
  ${body.join('\n  ')}
</svg>
`;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const dest = path.join(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), 'assets', 'hero.svg');
  writeFileSync(dest, buildHeroSvg());
  process.stdout.write(`${dest}\n`);
}
