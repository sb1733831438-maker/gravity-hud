import { readFileSync } from 'node:fs';
import path from 'node:path';

export const SEGMENT_KEYS = [
  'model',
  'project',
  'git',
  'agent',
  'context',
  'quota',
  'mode',
  'sandbox',
  'tasks',
  'tools',
  'subagents',
  'todos',
  'cost',
];

const COMPACT = {
  model: true,
  project: true,
  git: true,
  agent: true,
  context: true,
  quota: true,
  mode: true,
  sandbox: true,
  tasks: true,
  tools: false,
  subagents: false,
  todos: false,
  cost: false,
};

export const PRESETS = {
  minimal: {
    ...COMPACT,
    project: false,
    mode: false,
    sandbox: false,
    tasks: false,
  },
  compact: { ...COMPACT },
  full: {
    ...COMPACT,
    tools: true,
    subagents: true,
    todos: true,
    cost: true,
  },
};

function triState(value) {
  if (value === true || value === 'true' || value === 'on' || value === 'always') return true;
  if (value === false || value === 'false' || value === 'off' || value === 'never') return false;
  return 'auto';
}

export function defaultConfig(preset = 'compact') {
  const name = PRESETS[preset] ? preset : 'compact';
  return {
    preset: name,
    theme: 'gravity',
    ascii: 'auto',
    color: 'auto',
    segments: { ...PRESETS[name] },
  };
}

export function resolveConfig(user) {
  const raw = user && typeof user === 'object' && !Array.isArray(user) ? user : {};
  const preset = PRESETS[raw.preset] ? raw.preset : 'compact';
  const segments = { ...PRESETS[preset] };
  if (raw.segments && typeof raw.segments === 'object' && !Array.isArray(raw.segments)) {
    for (const key of SEGMENT_KEYS) {
      if (typeof raw.segments[key] === 'boolean') segments[key] = raw.segments[key];
    }
  }
  let barWidth = 0;
  const bars = raw.bars;
  if (bars && typeof bars === 'object' && Number.isFinite(bars.width)) barWidth = bars.width;
  if (Number.isFinite(raw.barWidth)) barWidth = raw.barWidth;
  let gitTimeoutMs = 180;
  if (Number.isFinite(raw.gitTimeoutMs)) {
    gitTimeoutMs = Math.min(2000, Math.max(50, raw.gitTimeoutMs));
  }
  return {
    preset,
    theme: typeof raw.theme === 'string' ? raw.theme : 'gravity',
    ascii: triState(raw.ascii),
    color: triState(raw.color),
    segments,
    barWidth,
    gitTimeoutMs,
    colors: raw.colors && typeof raw.colors === 'object' ? raw.colors : {},
  };
}

export function loadConfig(dir) {
  try {
    const parsed = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'));
    return resolveConfig(parsed);
  } catch {
    return resolveConfig({});
  }
}
