import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function homeDir(env = process.env) {
  if (env.GRAVITY_HUD_HOME) return env.GRAVITY_HUD_HOME;
  return os.homedir();
}

export function configDir(env = process.env) {
  if (env.GRAVITY_HUD_CONFIG_DIR) return env.GRAVITY_HUD_CONFIG_DIR;
  const home = homeDir(env);
  const platform = env.GRAVITY_HUD_PLATFORM || process.platform;
  if (!env.GRAVITY_HUD_HOME && env.XDG_CONFIG_HOME && platform !== 'win32') {
    return path.join(env.XDG_CONFIG_HOME, 'gravity-hud');
  }
  if (platform === 'win32') {
    const base = !env.GRAVITY_HUD_HOME && env.APPDATA
      ? env.APPDATA
      : path.join(home, 'AppData', 'Roaming');
    return path.join(base, 'gravity-hud');
  }
  return path.join(home, '.config', 'gravity-hud');
}

export function cacheDir(env = process.env) {
  if (env.GRAVITY_HUD_CACHE_DIR) return env.GRAVITY_HUD_CACHE_DIR;
  return path.join(configDir(env), 'cache');
}

export function settingsPath(env = process.env) {
  return path.join(homeDir(env), '.gemini', 'antigravity-cli', 'settings.json');
}

export function installDir(env = process.env) {
  return path.join(homeDir(env), '.gemini', 'antigravity-cli', 'gravity-hud');
}

export function packageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
}
