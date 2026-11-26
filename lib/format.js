import path from 'node:path';

export function asString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

export function formatPercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  if (value > 0 && value < 0.5) return '<1%';
  if (value >= 99.5 && value < 100) return '>99%';
  return `${Math.round(value)}%`;
}

export function formatTokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return '';
  if (value < 1000) return String(Math.round(value));
  if (value < 10000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  if (value < 1000000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1000000).toFixed(1).replace(/\.0$/, '')}m`;
}

export function formatReset(seconds) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return '';
  if (seconds <= 0) return 'due';
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  if (s < 600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem ? `${m}m${rem}s` : `${m}m`;
  }
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m ? `${h}h${m}m` : `${h}h`;
  }
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  return h ? `${d}d${h}h` : `${d}d`;
}

export function formatCost(cost) {
  if (!cost || typeof cost !== 'object') return '';
  const n = cost.total_usd;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) return '';
  const digits = n >= 0.01 ? 2 : 3;
  const body = n.toFixed(digits);
  return `${cost.estimated === true ? '~$' : '$'}${body}`;
}

export function fractionToPercent(fraction) {
  if (typeof fraction !== 'number' || !Number.isFinite(fraction)) return null;
  if (fraction >= 0 && fraction <= 1) return fraction * 100;
  if (fraction > 1 && fraction <= 100) return fraction;
  return null;
}

export function quotaLabel(id) {
  const raw = asString(id).toLowerCase();
  if (!raw) return 'quota';
  if (raw.includes('week')) return 'week';
  if (raw.includes('daily') || raw.endsWith('-1d') || raw.includes('24h')) return 'day';
  const match = raw.match(/(\d+)\s*([hd])/);
  if (match) return `${match[1]}${match[2]}`;
  const parts = raw.split(/[-_/]/).filter(Boolean);
  return (parts[parts.length - 1] || 'quota').slice(0, 10);
}

export function modelLabel(model) {
  if (!model || typeof model !== 'object') return '';
  const name = asString(model.display_name) || asString(model.id);
  if (!name) return '';
  const effort = asString(model.effort).toLowerCase();
  if (!effort || name.toLowerCase().includes(effort)) return name;
  return `${name} ${effort}`;
}

export function projectDir(session) {
  const ws = session && session.workspace;
  if (ws && typeof ws === 'object') {
    const project = asString(ws.project_dir);
    if (project) return project;
    const current = asString(ws.current_dir);
    if (current) return current;
  }
  return asString(session && session.cwd);
}

export function projectLabel(session) {
  const dir = projectDir(session);
  if (!dir) return '';
  const trimmed = dir.replace(/[\\/]+$/, '');
  const base = path.basename(trimmed);
  if (!base || base === '.' || base === '..') return '';
  return base;
}

export function formatState(agentState, ascii) {
  const known = {
    idle: ['READY', '●', '*'],
    working: ['WORKING', '▸', '>'],
    tool_use: ['TOOL', '▸', '>'],
    reviewing: ['REVIEW', '◉', 'o'],
    authenticating: ['AUTH', '●', '*'],
    initializing: ['INIT', '·', '.'],
    error: ['ERROR', '!', '!'],
    thinking: ['THINK', '◇', '~'],
  };
  const key = asString(agentState).toLowerCase();
  const row = known[key] || [key ? key.slice(0, 12).toUpperCase() : 'READY', '·', '*'];
  const glyph = ascii ? row[2] : row[1];
  return `${glyph} ${row[0]}`;
}

export function stateKey(agentState) {
  const key = asString(agentState).toLowerCase();
  return key || 'idle';
}

export function safeToken(value, max = 16) {
  const text = asString(value);
  if (!/^[A-Za-z0-9][A-Za-z0-9 _./+-]{0,40}$/.test(text)) return '';
  return text.slice(0, max);
}

export function modeLabel(cycleMode) {
  const mode = asString(cycleMode).toLowerCase();
  if (mode === 'accept-edits') return 'edits';
  if (mode === 'auto' || mode === 'plan') return mode;
  return safeToken(mode, 12).toLowerCase();
}
