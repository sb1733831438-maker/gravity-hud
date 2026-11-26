export const THEMES = {
  gravity: {
    label: '90',
    text: '37',
    accent: '96',
    model: '96',
    git: '94',
    gitDirty: '93',
    project: '37',
    sep: '90',
    todo: '95',
    tool: '96',
    sub: '94',
    good: '92',
    warn: '93',
    bad: '91',
    state: {
      idle: '92',
      working: '96',
      tool_use: '95',
      reviewing: '94',
      authenticating: '93',
      initializing: '90',
      error: '91',
      thinking: '93',
    },
  },
  dawn: {
    label: '90',
    text: '37',
    accent: '34',
    model: '34',
    git: '32',
    gitDirty: '33',
    project: '37',
    sep: '90',
    todo: '35',
    tool: '36',
    sub: '34',
    good: '32',
    warn: '33',
    bad: '31',
    state: {
      idle: '32',
      working: '36',
      tool_use: '35',
      reviewing: '34',
      authenticating: '33',
      initializing: '90',
      error: '31',
      thinking: '33',
    },
  },
  ember: {
    label: '90',
    text: '37',
    accent: '33',
    model: '91',
    git: '37',
    gitDirty: '91',
    project: '37',
    sep: '90',
    todo: '95',
    tool: '33',
    sub: '91',
    good: '33',
    warn: '91',
    bad: '31',
    state: {
      idle: '33',
      working: '91',
      tool_use: '95',
      reviewing: '37',
      authenticating: '33',
      initializing: '90',
      error: '31',
      thinking: '93',
    },
  },
  mono: {
    label: '90',
    text: '37',
    accent: '37',
    model: '37',
    git: '37',
    gitDirty: '97',
    project: '37',
    sep: '90',
    todo: '37',
    tool: '37',
    sub: '37',
    good: '37',
    warn: '97',
    bad: '97',
    state: {
      idle: '37',
      working: '97',
      tool_use: '97',
      reviewing: '37',
      authenticating: '37',
      initializing: '90',
      error: '97',
      thinking: '97',
    },
  },
};

const COLOR_CODE = /^\d{1,3}(;\d{1,3})*$/;

export function themeFor(name, overrides) {
  const base = THEMES[name] ? structuredClone(THEMES[name]) : structuredClone(THEMES.gravity);
  if (!overrides || typeof overrides !== 'object') return base;
  for (const [key, value] of Object.entries(overrides)) {
    if (typeof value === 'string' && COLOR_CODE.test(value) && key !== 'state') {
      base[key] = value;
    }
  }
  return base;
}
