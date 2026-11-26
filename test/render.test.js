import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { stripAnsi, visibleLength } from '../lib/ansi.js';
import { resolveConfig, loadConfig } from '../lib/config.js';
import { formatReset } from '../lib/format.js';
import { renderHud } from '../lib/render.js';
import { parseSession } from '../lib/session.js';
import { renderSample } from '../lib/preview.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sessionRaw = readFileSync(path.join(root, 'fixtures', 'session.json'), 'utf8');

function parsedSession() {
  return parseSession(sessionRaw).session;
}

test('formatReset renders a countdown', () => {
  assert.equal(formatReset(45), '45s');
  assert.equal(formatReset(90), '1m30s');
  assert.equal(formatReset(560580), '6d11h');
  assert.equal(formatReset(0), 'due');
});

test('compact fixture shows model, project, git, context, and quota', () => {
  const { session, redact } = parseSession(sessionRaw);
  const text = stripAnsi(renderHud({
    session,
    config: resolveConfig({ preset: 'compact', color: false }),
    git: { kind: 'git', branch: 'main', dirty: true },
    env: {},
    now: Date.parse('2026-07-01T00:00:00Z'),
  }));
  assert.match(text, /TOOL/);
  assert.match(text, /Gemini 4 Argon \(Medium\)/);
  assert.match(text, /my-project/);
  assert.match(text, /main\*/);
  assert.match(text, /plan/);
  assert.match(text, /tasks 1/);
  assert.match(text, /14%/);
  assert.match(text, /94%/);
  assert.match(text, /6d11h/);
  assert.doesNotMatch(text, /developer@example.com/);
  assert.equal(redact[0], 'developer@example.com');
  assert.equal(session.email, undefined);
});

test('full preset adds tools, subagents, todos, and cost from the sample', () => {
  const sample = renderSample({ preset: 'full', width: 120, color: false, root });
  const text = stripAnsi(sample.text);
  assert.match(text, /run_command git/);
  assert.match(text, /view_file statusline\.sh/);
  assert.match(text, /grep_search quota/);
  assert.match(text, /research running/);
  assert.match(text, /todos 2\/5/);
  assert.match(text, /Draw the context bar/);
  assert.match(text, /\$0\.42/);
  assert.doesNotMatch(text, /developer@example.com/);
  assert.doesNotMatch(sample.text, /developer@example.com/);
});

test('missing and unknown fields still render', () => {
  const text = stripAnsi(renderHud({
    session: {
      agent_state: 'sideways',
      model: null,
      context_window: 'nope',
      quota: null,
      terminal_width: 'wide',
      email: 'hidden@example.com',
    },
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /SIDEWAYS/);
  assert.match(text, /ctx —/);
  assert.match(text, /quota —/);
  assert.doesNotMatch(text, /hidden@example.com/);
});

test('empty session prints a status line', () => {
  const text = stripAnsi(renderHud({
    session: {},
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /READY/);
  assert.match(text, /ctx —/);
  assert.match(text, /quota —/);
});

test('lines stay within the terminal width', () => {
  const session = parsedSession();
  for (const width of [20, 30, 40, 55, 80, 100, 140]) {
    session.terminal_width = width;
    const text = renderHud({
      session,
      config: resolveConfig({ preset: 'full', color: true }),
      git: { kind: 'git', branch: 'feature/very-long-branch-name', dirty: true },
      transcript: {
        tools: [
          { name: 'view_file', target: 'a-very-long-filename.js', status: 'done' },
          { name: 'run_command', target: 'git', status: 'running' },
        ],
        todos: { items: [{ status: 'active', title: 'Draw the context bar and keep going past the edge of the terminal' }] },
        task: { name: '', status: '' },
      },
      env: {},
    });
    for (const line of text.split('\n')) {
      assert.ok(visibleLength(line) <= width, `${width}: ${stripAnsi(line)}`);
    }
  }
});

test('ascii mode avoids block glyphs and NO_COLOR strips escapes', () => {
  const session = parsedSession();
  const ascii = renderHud({
    session,
    config: resolveConfig({ ascii: true, color: true }),
    git: { kind: 'git', branch: 'main', dirty: false },
    env: {},
  });
  assert.match(ascii, /#/);
  assert.doesNotMatch(ascii, /█/);
  const plain = renderHud({
    session,
    config: resolveConfig({ color: true }),
    git: { kind: 'git', branch: 'main', dirty: false },
    env: { NO_COLOR: '1' },
  });
  assert.doesNotMatch(plain, /\x1b/);
});

test('the tighter quota bucket is shown first', () => {
  const text = stripAnsi(renderHud({
    session: {
      quota: {
        'gemini-weekly': { remaining_fraction: 0.9, reset_in_seconds: 80000 },
        'prompt-5h': { remaining_fraction: 0.2, reset_in_seconds: 600 },
      },
      terminal_width: 140,
    },
    config: resolveConfig({ color: false }),
    env: {},
  }));
  const week = text.indexOf('week');
  const five = text.indexOf('5h');
  assert.ok(five !== -1 && week !== -1);
  assert.ok(five < week);
  assert.match(text, /20%/);
  assert.match(text, /90%/);
});

test('disabled quota buckets are skipped', () => {
  const text = stripAnsi(renderHud({
    session: {
      quota: {
        off: { remaining_fraction: 0.1, disabled: true },
        'prompt-5h': { remaining_fraction: 0.5, reset_in_seconds: 120 },
      },
      terminal_width: 100,
    },
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /5h/);
  assert.match(text, /50%/);
  assert.match(text, /2m/);
  assert.doesNotMatch(text, /quota off/);
});

test('all-disabled quota says quota off', () => {
  const text = stripAnsi(renderHud({
    session: { quota: { week: { disabled: true, remaining_fraction: 1 } }, terminal_width: 80 },
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /quota off/);
});

test('wide terminals include the token total', () => {
  const session = parsedSession();
  session.terminal_width = 140;
  const text = stripAnsi(renderHud({
    session,
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /149k/);
  assert.match(text, /in 88k/);
  assert.match(text, /out 61k/);
});

test('jj repos do not pretend to be git', () => {
  const text = stripAnsi(renderHud({
    session: { vcs: { type: 'jj' }, terminal_width: 80 },
    config: resolveConfig({ color: false }),
    git: { kind: 'jj', branch: '', dirty: false },
    env: {},
  }));
  assert.match(text, /\bjj\b/);
});

test('segment toggles hide the model', () => {
  const text = stripAnsi(renderHud({
    session: parsedSession(),
    config: resolveConfig({ segments: { model: false }, color: false }),
    env: {},
  }));
  assert.doesNotMatch(text, /Gemini/);
});

test('sandbox and confirm badges appear when set', () => {
  const text = stripAnsi(renderHud({
    session: {
      sandbox: { enabled: true },
      tool_confirmation_pending: true,
      terminal_width: 80,
    },
    config: resolveConfig({ color: false }),
    env: {},
  }));
  assert.match(text, /sandbox/);
  assert.match(text, /confirm/);
});

test('reset_time is used when reset_in_seconds is absent', () => {
  const now = Date.parse('2026-07-01T00:00:00Z');
  const text = stripAnsi(renderHud({
    session: {
      quota: { weekly: { remaining_fraction: 0.9, reset_time: '2026-07-01T01:00:00Z' } },
      terminal_width: 80,
    },
    config: resolveConfig({ color: false }),
    env: {},
    now,
  }));
  assert.match(text, /1h/);
});

test('corrupt config falls back and still renders', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gravity-hud-cfg-'));
  try {
    writeFileSync(path.join(dir, 'config.json'), '{');
    const config = loadConfig(dir);
    const text = renderHud({ session: {}, config, env: {} });
    assert.match(text, /READY/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
