import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { collectGit, parseGitStatus } from '../lib/git.js';
import { resolveConfig } from '../lib/config.js';

test('parseGitStatus reads branch and dirty files', () => {
  assert.deepEqual(parseGitStatus('## main...origin/main\n'), { branch: 'main', dirty: false });
  assert.deepEqual(parseGitStatus('## feature/hud...origin/feature/hud [ahead 1]\n M file.js\n'), {
    branch: 'feature/hud',
    dirty: true,
  });
  assert.deepEqual(parseGitStatus('## HEAD (no branch)\n'), { branch: 'HEAD', dirty: false });
  assert.deepEqual(parseGitStatus('## No commits yet on master\n'), { branch: 'master', dirty: false });
  assert.deepEqual(parseGitStatus('## Initial commit on main\n'), { branch: 'main', dirty: false });
  assert.deepEqual(parseGitStatus('## No commits yet on feature/hud\nA  file.js\n'), {
    branch: 'feature/hud',
    dirty: true,
  });
  assert.equal(parseGitStatus(''), null);
});

test('local git reports a clean and a dirty worktree', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gravity-hud-git-'));
  try {
    const git = (args) => {
      const result = spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com', GIT_TERMINAL_PROMPT: '0' },
      });
      assert.equal(result.status, 0, result.stderr);
    };
    git(['init', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Gravity Hud Test']);
    writeFileSync(path.join(dir, 'readme.txt'), 'hello\n');
    git(['add', 'readme.txt']);
    git(['commit', '-m', 'init']);
    const clean = collectGit(
      { workspace: { project_dir: dir }, vcs: { type: 'git' } },
      resolveConfig({}),
    );
    assert.equal(clean.branch, 'main');
    assert.equal(clean.dirty, false);
    writeFileSync(path.join(dir, 'readme.txt'), 'hello\nchanged\n');
    const dirty = collectGit(
      { workspace: { project_dir: dir } },
      resolveConfig({}),
    );
    assert.equal(dirty.branch, 'main');
    assert.equal(dirty.dirty, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a repository with no commits reports the branch name only', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gravity-hud-unborn-'));
  try {
    const git = (args) => {
      const result = spawnSync('git', args, {
        cwd: dir,
        encoding: 'utf8',
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      });
      assert.equal(result.status, 0, result.stderr);
    };
    git(['init', '-b', 'master']);
    const live = collectGit(
      { workspace: { project_dir: dir }, vcs: { type: 'git' } },
      resolveConfig({}),
    );
    assert.equal(live.branch, 'master');
    assert.equal(live.dirty, false);
    assert.doesNotMatch(live.branch, /commit/i);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('jj and hg skip the local git probe', () => {
  let called = false;
  const result = collectGit(
    { vcs: { type: 'jj', branch: 'main' }, workspace: { project_dir: '/tmp' } },
    resolveConfig({}),
    () => {
      called = true;
      return { branch: 'nope', dirty: true };
    },
  );
  assert.equal(called, false);
  assert.equal(result.kind, 'jj');
  assert.equal(result.branch, 'main');
});
