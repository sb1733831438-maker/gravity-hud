import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../lib/version.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = path.join(root, 'bin', 'gravity-hud.js');
const session = readFileSync(path.join(root, 'fixtures', 'session.json'));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));

function isolatedEnv() {
  const home = mkdtempSync(path.join(tmpdir(), 'gravity-hud-cli-'));
  return {
    home,
    env: {
      ...process.env,
      GRAVITY_HUD_HOME: home,
      GRAVITY_HUD_CONFIG_DIR: path.join(home, 'config'),
      GRAVITY_HUD_CACHE_DIR: path.join(home, 'cache'),
    },
  };
}

function run(args, { input, env } = {}) {
  return spawnSync(process.execPath, [bin, ...args], {
    input,
    encoding: 'utf8',
    env,
    cwd: root,
  });
}

test('version matches package.json', () => {
  assert.equal(VERSION, pkg.version);
  const result = run(['--version'], { env: process.env });
  assert.equal(result.status, 0);
  assert.match(result.stdout, /0\.1\.0/);
});

test('stdin render exits 0 and hides the email', () => {
  const { home, env } = isolatedEnv();
  try {
    const result = run([], { input: session, env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Gemini 4 Argon/);
    assert.match(result.stdout, /14%/);
    assert.match(result.stdout, /94%/);
    assert.doesNotMatch(result.stdout, /developer@example.com/);
    assert.doesNotMatch(result.stderr, /developer@example.com/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('preview full preset stays inside the sample width', () => {
  const result = run(['preview', '--preset', 'full', '--width', '100', '--no-color'], { env: process.env });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /todos 2\/5/);
  assert.doesNotMatch(result.stdout, /developer@example.com/);
  for (const line of result.stdout.split(/\r?\n/)) {
    if (!line) continue;
    assert.ok([...line].length <= 100, line);
  }
});

test('broken stdin still prints a line and exits 0', () => {
  const { home, env } = isolatedEnv();
  try {
    const result = run([], { input: '{', env });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /READY|gravity-hud/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
