import {
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { defaultConfig } from './config.js';
import { homeDir, installDir, packageRoot, settingsPath } from './paths.js';
import { VERSION } from './version.js';

function isInside(parent, target) {
  const rel = path.relative(parent, target);
  return rel === '' || (!rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel));
}

function assertSafeSettings(file, home) {
  if (!existsSync(file)) return;
  const stat = lstatSync(file);
  if (!stat.isFile() && !stat.isSymbolicLink()) {
    throw new Error('settings.json is not a regular file');
  }
  const gemini = path.join(home, '.gemini');
  const realFile = realpathSync(file);
  const realGemini = existsSync(gemini) ? realpathSync(gemini) : path.resolve(gemini);
  if (!isInside(realGemini, realFile)) {
    throw new Error('refusing to edit settings.json outside ~/.gemini');
  }
}

function writeAtomic(file, contents, mode = 0o600) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, contents, { mode });
  try {
    chmodSync(tmp, mode);
  } catch {
    /* Windows may ignore POSIX modes. */
  }
  try {
    renameOverwrite(tmp, file);
  } catch (error) {
    try {
      unlinkSync(tmp);
    } catch {
      /* ignore */
    }
    throw error;
  }
  try {
    chmodSync(file, mode);
  } catch {
    /* Windows may ignore POSIX modes. */
  }
}

function renameOverwrite(from, to) {
  try {
    renameSync(from, to);
  } catch {
    if (existsSync(to)) unlinkSync(to);
    renameSync(from, to);
  }
}

export function statuslineCommand(platform = process.platform) {
  if (platform === 'win32') return '~/.gemini/antigravity-cli/gravity-hud/statusline.cmd';
  return '~/.gemini/antigravity-cli/gravity-hud/statusline.sh';
}

export function isOurCommand(command) {
  return typeof command === 'string'
    && command.includes('gravity-hud')
    && command.includes('statusline.');
}

function launcherSh() {
  return `#!/bin/sh
# gravity-hud launcher. Local only: no network and no credential files.
DIR=$(CDPATH= cd -- "$(dirname "$0")" && pwd) || {
  printf '%s\\n' 'gravity-hud'
  exit 0
}
run() {
  "$1" "$DIR/bin/gravity-hud.js"
  exit 0
}
if [ -n "\${GRAVITY_HUD_NODE:-}" ] && [ -x "\${GRAVITY_HUD_NODE}" ]; then
  run "$GRAVITY_HUD_NODE"
fi
if command -v node >/dev/null 2>&1; then
  run node
fi
for c in "\${HOME:-}/.local/bin/node" /usr/local/bin/node /opt/homebrew/bin/node; do
  if [ -x "$c" ]; then
    run "$c"
  fi
done
printf '%s\\n' 'gravity-hud'
exit 0
`;
}

function launcherCmd() {
  return `@echo off\r
setlocal\r
set "DIR=%~dp0"\r
if defined GRAVITY_HUD_NODE (\r
  "%GRAVITY_HUD_NODE%" "%DIR%bin\\gravity-hud.js"\r
  exit /b 0\r
)\r
where node >nul 2>nul\r
if %ERRORLEVEL%==0 (\r
  node "%DIR%bin\\gravity-hud.js"\r
  exit /b 0\r
)\r
echo gravity-hud\r
exit /b 0\r
`;
}

function readSettings(file) {
  if (!existsSync(file)) return { existed: false, value: {} };
  const raw = readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  if (!raw.trim()) return { existed: true, value: {} };
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    const error = new Error('settings.json is not valid JSON; it was not modified');
    error.code = 'INVALID_JSON';
    throw error;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    const error = new Error('settings.json must contain a JSON object; it was not modified');
    error.code = 'INVALID_JSON';
    throw error;
  }
  return { existed: true, value };
}

function backupSettings(file, dir) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `settings.json.bak-gravity-hud-${stamp}`);
  copyFileSync(file, dest);
  const names = readdirSync(dir)
    .filter((name) => name.startsWith('settings.json.bak-gravity-hud-'))
    .sort();
  while (names.length > 5) {
    const oldest = names.shift();
    try {
      unlinkSync(path.join(dir, oldest));
    } catch {
      /* ignore */
    }
  }
  return dest;
}

function copyRuntime(root, dest) {
  mkdirSync(dest, { recursive: true });
  for (const name of ['lib', 'bin', 'fixtures']) {
    const from = path.join(root, name);
    if (!existsSync(from)) continue;
    const to = path.join(dest, name);
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  }
}

function writeLaunchers(dest, platform) {
  if (platform === 'win32') {
    writeFileSync(path.join(dest, 'statusline.cmd'), launcherCmd());
    return;
  }
  const file = path.join(dest, 'statusline.sh');
  writeFileSync(file, launcherSh(), { mode: 0o755 });
  try {
    chmodSync(file, 0o755);
  } catch {
    /* ignore */
  }
}

function readState(file) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value;
  } catch {
    return null;
  }
}

function writeConfigIfNeeded(configDirectory, preset, dryRun) {
  const file = path.join(configDirectory, 'config.json');
  if (existsSync(file)) {
    if (!preset) return { file, wrote: false };
    const current = readState(file);
    if (!current) return { file, wrote: false };
    current.preset = preset;
    if (!dryRun) {
      mkdirSync(configDirectory, { recursive: true });
      writeAtomic(file, `${JSON.stringify(current, null, 2)}\n`, 0o600);
    }
    return { file, wrote: true };
  }
  if (!dryRun) {
    mkdirSync(configDirectory, { recursive: true });
    writeAtomic(file, `${JSON.stringify(defaultConfig(preset || 'compact'), null, 2)}\n`, 0o600);
  }
  return { file, wrote: true };
}

export function install(options = {}) {
  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const dryRun = Boolean(options.dryRun);
  const force = Boolean(options.force);
  const home = options.home || homeDir(env);
  if (!home) throw new Error('home directory is unknown');
  const localEnv = { ...env, GRAVITY_HUD_HOME: home };
  const settings = settingsPath(localEnv);
  const dest = installDir(localEnv);
  const root = options.root || packageRoot();
  const configDirectory = options.configDir;
  assertSafeSettings(settings, home);
  const { existed, value } = readSettings(settings);
  const current = value.statusLine;
  const currentCommand = current && typeof current === 'object' ? current.command : '';
  const ours = isOurCommand(currentCommand);
  const hasForeign = Boolean(currentCommand) && !ours;
  if (hasForeign && !force) {
    const error = new Error('settings.json already has a status line command; re-run with --force to replace it');
    error.code = 'FOREIGN';
    throw error;
  }
  const command = statuslineCommand(platform);
  const stateFile = path.join(dest, 'install-state.json');
  const previous = readState(stateFile);
  const snapshot = {
    managed: true,
    version: VERSION,
    hadStatusLine: current !== undefined,
    previousStatusLine: current === undefined ? null : current,
  };
  const state = previous && previous.managed === true && !hasForeign ? previous : snapshot;
  let backup = '';
  if (!dryRun) {
    mkdirSync(path.dirname(settings), { recursive: true });
    if (existed) backup = backupSettings(settings, path.dirname(settings));
    copyRuntime(root, dest);
    writeFileSync(path.join(dest, 'package.json'), `${JSON.stringify({
      name: 'gravity-hud',
      version: VERSION,
      private: true,
      type: 'module',
    }, null, 2)}\n`);
    writeLaunchers(dest, platform);
    writeAtomic(stateFile, `${JSON.stringify(state, null, 2)}\n`);
    const nextStatus = {
      ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}),
      type: 'command',
      command,
    };
    value.statusLine = nextStatus;
    writeAtomic(settings, `${JSON.stringify(value, null, 2)}\n`);
  }
  const config = configDirectory
    ? writeConfigIfNeeded(configDirectory, options.preset, dryRun)
    : null;
  return {
    command,
    settings,
    dest,
    backup,
    config: config?.file || '',
    dryRun,
    replaced: hasForeign,
  };
}

export function uninstall(options = {}) {
  const env = options.env || process.env;
  const dryRun = Boolean(options.dryRun);
  const home = options.home || homeDir(env);
  if (!home) throw new Error('home directory is unknown');
  const localEnv = { ...env, GRAVITY_HUD_HOME: home };
  const settings = settingsPath(localEnv);
  const dest = installDir(localEnv);
  const state = readState(path.join(dest, 'install-state.json'));
  let restored = false;
  let removedCommand = false;
  if (existsSync(settings)) {
    assertSafeSettings(settings, home);
    let value = null;
    try {
      value = readSettings(settings).value;
    } catch (error) {
      if (error.code !== 'INVALID_JSON') throw error;
    }
    const command = value?.statusLine && typeof value.statusLine === 'object' ? value.statusLine.command : '';
    if (value && isOurCommand(command)) {
      removedCommand = true;
      if (state && state.managed === true) {
        if (state.hadStatusLine) value.statusLine = state.previousStatusLine;
        else delete value.statusLine;
        restored = true;
      } else {
        delete value.statusLine;
      }
      if (!dryRun) {
        backupSettings(settings, path.dirname(settings));
        writeAtomic(settings, `${JSON.stringify(value, null, 2)}\n`);
      }
    }
  }
  if (!dryRun && existsSync(dest)) {
    rmSync(dest, { recursive: true, force: true });
  }
  return { settings, dest, restored, removedCommand, dryRun };
}
