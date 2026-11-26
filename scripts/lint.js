import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const roots = ['bin', 'lib', 'scripts', 'test'];
const forbidden = [
  /from\s+['"]node:(http|https|net|dns|tls)['"]/,
  /require\(\s*['"](?:node:)?(http|https|net|dns|tls)['"]\s*\)/,
  /(?<![\w.])fetch\s*\(/,
  /(?<![\w.])eval\s*\(/,
  /(?<![\w.])execSync\s*\(/,
  /(?<![\w.])execFile(?:Sync)?\s*\(/,
  /(?<![\w.])exec\s*\(/,
];

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules') continue;
    const full = path.join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, files);
    else if (name.endsWith('.js')) files.push(full);
  }
  return files;
}

const files = roots.flatMap((name) => walk(path.join(root, name)));
let failed = 0;
for (const file of files) {
  const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (check.status !== 0) {
    failed += 1;
    process.stderr.write(`${path.relative(root, file)} failed syntax check\n${check.stderr}`);
  }
  const text = await readText(file);
  if ((file.includes(`${path.sep}lib${path.sep}`) || file.includes(`${path.sep}bin${path.sep}`)) && forbidden.some((rule) => rule.test(text))) {
    failed += 1;
    process.stderr.write(`${path.relative(root, file)} uses a forbidden network or shell API\n`);
  }
}

if (!files.length) {
  process.stderr.write('no JavaScript files found\n');
  process.exit(1);
}

if (failed) process.exit(1);
process.stdout.write(`lint ok (${files.length} files)\n`);

async function readText(file) {
  const { readFileSync } = await import('node:fs');
  return readFileSync(file, 'utf8');
}
