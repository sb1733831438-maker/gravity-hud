import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PRESETS } from './config.js';
import { loadConfig } from './config.js';
import { collectGit } from './git.js';
import { install, uninstall } from './install.js';
import { cacheDir, configDir, settingsPath } from './paths.js';
import { renderSample } from './preview.js';
import { renderHud } from './render.js';
import { parseSession, resolveTranscriptPath, scrub } from './session.js';
import { loadTranscript } from './transcript.js';
import { VERSION } from './version.js';

function readStdinText() {
  try {
    if (process.stdin.isTTY) return '';
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function parseFlags(argv) {
  const flags = {
    cmd: 'render',
    force: false,
    dryRun: false,
    preset: '',
    width: 0,
    ascii: false,
    noColor: false,
  };
  const args = argv.slice();
  if (args[0] === '--help' || args[0] === '-h') flags.cmd = 'help';
  else if (args[0] === '--version' || args[0] === '-v') flags.cmd = 'version';
  else if (args[0] && !args[0].startsWith('-')) flags.cmd = args.shift();
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--force') flags.force = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--help' || arg === '-h') flags.cmd = 'help';
    else if (arg === '--version' || arg === '-v') flags.cmd = 'version';
    else if (arg === '--ascii') flags.ascii = true;
    else if (arg === '--no-color') flags.noColor = true;
    else if (arg === '--preset') flags.preset = args[++i] || '';
    else if (arg === '--width') flags.width = Number(args[++i]);
    else {
      const error = new Error(`unknown option "${arg}"`);
      error.code = 'USAGE';
      throw error;
    }
  }
  return flags;
}

function helpText() {
  return [
    `gravity-hud ${VERSION}`,
    '',
    'Real-time status line for the Antigravity CLI (agy).',
    '',
    'Usage:',
    '  gravity-hud                 Render a status line from session JSON on stdin',
    '  gravity-hud install         Wire ~/.gemini/antigravity-cli/settings.json',
    '  gravity-hud uninstall       Remove the status line and installed files',
    '  gravity-hud preview         Render the bundled sample',
    '  gravity-hud doctor          Local environment check',
    '',
    'Options:',
    '  --preset compact|minimal|full',
    '  --force                     Replace an existing status line command',
    '  --dry-run                   Show install or uninstall actions without writing',
    '  --width <columns>           Preview width',
    '  --ascii                     ASCII bars',
    '  --no-color                  Disable ANSI color',
    '',
    'The account email in the session JSON is never printed.',
  ].join('\n');
}

function printResult(lines) {
  process.stdout.write(`${lines.filter(Boolean).join('\n')}\n`);
}

function renderCommand(env, flags) {
  if (flags.preset && !PRESETS[flags.preset]) {
    process.stderr.write(`unknown preset "${flags.preset}"\n`);
    return 1;
  }
  const { session, redact } = parseSession(readStdinText());
  let config = loadConfig(configDir(env));
  if (flags.preset) {
    config = { ...config, preset: flags.preset, segments: { ...PRESETS[flags.preset] } };
  }
  if (flags.ascii) config = { ...config, ascii: true };
  if (flags.noColor) config = { ...config, color: false };
  if (Number.isFinite(flags.width) && flags.width > 0) session.terminal_width = flags.width;
  const git = collectGit(session, config);
  let transcript = null;
  if (config.segments.tools || config.segments.todos) {
    const file = resolveTranscriptPath(session, env);
    if (file) transcript = loadTranscript(file, cacheDir(env));
  }
  const text = scrub(renderHud({ session, config, git, transcript, env }), redact);
  process.stdout.write(`${text}\n`);
  return 0;
}

function doctorLines(env) {
  const cfg = `${configDir(env)}/config.json`.replace(/\\/g, '/');
  const settings = settingsPath(env);
  let status = 'not configured';
  if (existsSync(settings)) {
    try {
      const value = JSON.parse(readFileSync(settings, 'utf8'));
      const command = value && value.statusLine && value.statusLine.command;
      if (typeof command === 'string' && command.includes('gravity-hud')) status = 'gravity-hud';
      else if (command) status = 'other command';
      else status = 'no command';
    } catch {
      status = 'invalid JSON (not modified)';
    }
  }
  const git = spawnSync('git', ['--version'], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
  return [
    `gravity-hud ${VERSION}`,
    `node ${process.version}`,
    `platform ${process.platform}`,
    `config ${existsSync(configDir(env) + '/config.json') || existsSync(`${configDir(env)}/config.json`) ? 'ok' : 'missing'} ${cfg}`,
    `settings ${status}`,
    `git ${git.status === 0 ? 'ok' : 'not found'}`,
    'network disabled',
    'email hidden',
  ];
}

export function main(argv = process.argv.slice(2), env = process.env) {
  let flags;
  try {
    flags = parseFlags(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n${helpText()}\n`);
    return 1;
  }
  try {
    if (flags.cmd === 'help') {
      printResult([helpText()]);
      return 0;
    }
    if (flags.cmd === 'version') {
      printResult([VERSION]);
      return 0;
    }
    if (flags.cmd === 'preview') {
      const preset = flags.preset || 'compact';
      if (!PRESETS[preset]) {
        process.stderr.write(`unknown preset "${preset}"\n`);
        return 1;
      }
      const sampleEnv = flags.noColor ? { ...env, NO_COLOR: '1' } : env;
      const sample = renderSample({
        preset,
        width: Number.isFinite(flags.width) && flags.width > 0 ? flags.width : 100,
        color: !flags.noColor,
        ascii: flags.ascii,
        env: sampleEnv,
      });
      process.stderr.write('preview uses fixtures/session.json with sample git main*\n');
      process.stdout.write(`${scrub(sample.text, sample.redact)}\n`);
      return 0;
    }
    if (flags.cmd === 'doctor') {
      printResult(doctorLines(env));
      return 0;
    }
    if (flags.cmd === 'install') {
      if (flags.preset && !PRESETS[flags.preset]) {
        process.stderr.write(`unknown preset "${flags.preset}"\n`);
        return 1;
      }
      const result = install({
        env,
        dryRun: flags.dryRun,
        force: flags.force,
        preset: flags.preset,
        configDir: configDir(env),
        platform: env.GRAVITY_HUD_PLATFORM || process.platform,
      });
      printResult([
        flags.dryRun ? 'dry-run: settings.json would be updated' : `status line -> ${result.command}`,
        flags.dryRun ? `dry-run: ${result.settings}` : `settings -> ${result.settings}`,
        result.backup ? `backup -> ${result.backup}` : '',
        result.config ? `config -> ${result.config}` : '',
        'Restart agy. The account email is never printed.',
      ]);
      return 0;
    }
    if (flags.cmd === 'uninstall') {
      const result = uninstall({ env, dryRun: flags.dryRun });
      printResult([
        result.removedCommand
          ? (flags.dryRun ? 'dry-run: would remove the gravity-hud status line' : 'removed the gravity-hud status line')
          : 'settings.json does not use gravity-hud',
        result.restored ? 'restored the previous statusLine value' : '',
        flags.dryRun ? `dry-run: would delete ${result.dest}` : `deleted ${result.dest}`,
      ]);
      return 0;
    }
    if (flags.cmd === 'render' || flags.cmd === 'statusline') return renderCommand(env, flags);
    process.stderr.write(`unknown command "${flags.cmd}"\n${helpText()}\n`);
    return 1;
  } catch (error) {
    const rendering = !flags || flags.cmd === 'render' || flags.cmd === 'statusline';
    if (rendering) {
      process.stdout.write('gravity-hud\n');
      return 0;
    }
    process.stderr.write(`${error && error.message ? error.message : 'gravity-hud failed'}\n`);
    return error && error.code === 'FOREIGN' ? 2 : 1;
  }
}
