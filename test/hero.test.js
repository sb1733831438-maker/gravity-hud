import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildHeroSvg } from '../scripts/render-hero.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('hero svg is the renderer output and hides the sample email', () => {
  const svg = buildHeroSvg();
  const committed = readFileSync(path.join(root, 'assets', 'hero.svg'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, svg);
  assert.match(svg, /Gemini 4 Argon/);
  assert.match(svg, /todos/);
  assert.match(svg, /fill="#5ee0a0"|fill="#7ee7f7"|fill="#92"|fill="#96"/);
  assert.doesNotMatch(svg, /developer@example.com/);
  assert.doesNotMatch(svg, /example\.com/);
});
