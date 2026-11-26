import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { install, isOurCommand, statuslineCommand, uninstall } from '../lib/install.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const session = readFileSync(path.join(root, 'fixtures', 'session.json'));

function tempHome() {
  const home = mkdtempSync(path.join(tmpdir(), 'gravity-hud-home-'));
  const configDir = path.join(home, 'config');
  const env = {
    ...process.env,
    GRAVITY_HUD_HOME: home,
    GRAVITY_HUD_CONFIG_DIR: configDir,
    GRAVITY_HUD_CACHE_DIR: path.join(home, 'cache'),
  };
  return { home, configDir, env };
}

test('install writes a backup, settings, and a working launcher', () => {
  const { home, configDir, env } = tempHome();
  try {
    const first = install({ env, root, configDir, preset: 'compact' });
    const settingsFile = path.join(home, '.gemini', 'antigravity-cli', 'settings.json');
    const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(settings.statusLine.type, 'command');
    assert.equal(settings.statusLine.command, statuslineCommand(process.platform));
    assert.equal(isOurCommand(settings.statusLine.command), true);
    const launcherName = process.platform === 'win32' ? 'statusline.cmd' : 'statusline.sh';
    const launcher = path.join(home, '.gemini', 'antigravity-cli', 'gravity-hud', launcherName);
    assert.equal(existsSync(launcher), true);
    if (process.platform !== 'win32') {
      assert.equal(statSync(settingsFile).mode & 0o777, 0o600);
      const check = spawnSync('sh', ['-n', launcher], { encoding: 'utf8' });
      assert.equal(check.status, 0, check.stderr);
      const rendered = spawnSync('sh', [launcher], {
        input: session,
        encoding: 'utf8',
        env,
      });
      assert.equal(rendered.status, 0, rendered.stderr);
      assert.match(rendered.stdout, /Gemini 4 Argon/);
      assert.doesNotMatch(rendered.stdout, /developer@example.com/);
    }
    const config = JSON.parse(readFileSync(path.join(configDir, 'config.json'), 'utf8'));
    assert.equal(config.preset, 'compact');

    const again = install({ env, root, configDir });
    assert.equal(again.command, first.command);
    const preserved = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(preserved.statusLine.command, settings.statusLine.command);

    const removed = uninstall({ env });
    assert.equal(removed.removedCommand, true);
    const after = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(after.statusLine, undefined);
    assert.equal(existsSync(path.join(home, '.gemini', 'antigravity-cli', 'gravity-hud')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('install refuses to replace a foreign command unless forced', () => {
  const { home, configDir, env } = tempHome();
  const settingsFile = path.join(home, '.gemini', 'antigravity-cli', 'settings.json');
  try {
    const original = {
      colorScheme: 'tokyo night',
      statusLine: { type: 'command', command: '/tmp/other.sh', padding: 1 },
    };
    mkdirSyncNested(settingsFile);
    writeFileSync(settingsFile, JSON.stringify(original));
    assert.throws(() => install({ env, root, configDir }), /--force/);
    assert.equal(readFileSync(settingsFile, 'utf8'), JSON.stringify(original));
    install({ env, root, configDir, force: true });
    const updated = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(updated.colorScheme, 'tokyo night');
    assert.equal(updated.statusLine.padding, 1);
    assert.equal(isOurCommand(updated.statusLine.command), true);
    uninstall({ env });
    const restored = JSON.parse(readFileSync(settingsFile, 'utf8'));
    assert.equal(restored.statusLine.command, '/tmp/other.sh');
    assert.equal(restored.statusLine.padding, 1);
    assert.equal(restored.colorScheme, 'tokyo night');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('invalid settings.json is left untouched', () => {
  const { home, configDir, env } = tempHome();
  const settingsFile = path.join(home, '.gemini', 'antigravity-cli', 'settings.json');
  try {
    mkdirSyncNested(settingsFile);
    writeFileSync(settingsFile, '{oops');
    assert.throws(() => install({ env, root, configDir }), /not valid JSON/);
    assert.equal(readFileSync(settingsFile, 'utf8'), '{oops');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('dry-run does not write settings', () => {
  const { home, configDir, env } = tempHome();
  try {
    const result = install({ env, root, configDir, dryRun: true });
    assert.equal(result.dryRun, true);
    assert.equal(existsSafe(path.join(home, '.gemini', 'antigravity-cli', 'settings.json')), false);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('a settings symlink outside .gemini is refused', () => {
  if (process.platform === 'win32') return;
  const { home, configDir, env } = tempHome();
  const outside = path.join(home, 'outside.json');
  const settingsFile = path.join(home, '.gemini', 'antigravity-cli', 'settings.json');
  try {
    writeFileSync(outside, '{"keep":true}\n');
    mkdirSyncNested(settingsFile);
    symlinkSync(outside, settingsFile);
    assert.throws(() => install({ env, root, configDir }), /outside/);
    assert.match(readFileSync(outside, 'utf8'), /keep/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function mkdirSyncNested(file) {
  const { mkdirSync } = fs();
  mkdirSync(path.dirname(file), { recursive: true });
}

function existsSafe(file) {
  const { existsSync } = fs();
  return existsSync(file);
}

import { existsSync, mkdirSync } from 'node:fs';

function fs() {
  return { mkdirSync, existsSync };
}
