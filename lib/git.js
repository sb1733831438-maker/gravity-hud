import { spawnSync } from 'node:child_process';
import { projectDir } from './format.js';

export function parseGitStatus(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (!lines.length || !lines[0].startsWith('##')) return null;
  let head = lines[0].slice(2).trim();
  const dots = head.indexOf('...');
  if (dots !== -1) head = head.slice(0, dots);
  const bracket = head.indexOf(' [');
  if (bracket !== -1) head = head.slice(0, bracket);
  if (head.startsWith('HEAD (no branch)')) head = 'HEAD';
  head = head.trim();
  if (!head || /[\r\n]/.test(head)) return null;
  const dirty = lines.slice(1).some((line) => line.trim().length > 0);
  return { branch: head.slice(0, 80), dirty };
}

export function readGit(dir, timeoutMs = 180) {
  if (!dir || typeof dir !== 'string') return null;
  let result;
  try {
    result = spawnSync(
      'git',
      ['status', '-sb', '-uno', '--ignore-submodules=dirty'],
      {
        cwd: dir,
        timeout: timeoutMs,
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
        maxBuffer: 256 * 1024,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
    );
  } catch {
    return null;
  }
  if (!result || result.error || result.status !== 0 || typeof result.stdout !== 'string') return null;
  return parseGitStatus(result.stdout);
}

export function collectGit(session, config, reader = readGit) {
  if (!config?.segments?.git) return null;
  const vcs = session && session.vcs && typeof session.vcs === 'object' ? session.vcs : null;
  const type = typeof vcs?.type === 'string' ? vcs.type : '';
  if (type === 'jj' || type === 'hg') {
    const branch = typeof vcs.branch === 'string' ? vcs.branch : '';
    return { kind: type, branch: branch.slice(0, 80), dirty: false };
  }
  const dir = projectDir(session || {});
  const live = dir ? reader(dir, config.gitTimeoutMs || 180) : null;
  if (live && live.branch) return { kind: 'git', branch: live.branch, dirty: Boolean(live.dirty) };
  if (vcs && typeof vcs.branch === 'string' && vcs.branch.trim()) {
    return { kind: 'git', branch: vcs.branch.trim().slice(0, 80), dirty: vcs.dirty === true };
  }
  return null;
}
