import { paint, visibleLength } from './ansi.js';
import { bar, barWidth, meterColor } from './bar.js';
import {
  formatCost,
  formatPercent,
  formatReset,
  formatState,
  formatTokens,
  fractionToPercent,
  modeLabel,
  modelLabel,
  projectLabel,
  quotaLabel,
  stateKey,
} from './format.js';
import { layoutLine } from './layout.js';
import { summarizeTodos } from './transcript.js';
import { themeFor } from './theme.js';

function terminalWidth(session, env) {
  const width = session && session.terminal_width;
  if (typeof width === 'number' && Number.isFinite(width)) {
    return Math.max(20, Math.min(240, Math.floor(width)));
  }
  const columns = Number(env && env.COLUMNS);
  if (Number.isFinite(columns) && columns >= 20) return Math.min(240, Math.floor(columns));
  return 80;
}

export function useColor(config, env = process.env) {
  if (env.NO_COLOR || env.GRAVITY_HUD_NO_COLOR) return false;
  if (config.color === false) return false;
  if (config.color === true) return true;
  if (env.TERM === 'dumb') return false;
  return true;
}

export function useAscii(config, env = process.env) {
  if (env.GRAVITY_HUD_ASCII === '1' || env.GRAVITY_HUD_ASCII === 'true') return true;
  if (config.ascii === true) return true;
  if (config.ascii === false) return false;
  if (env.TERM === 'dumb') return true;
  return false;
}

function contextPercent(ctx) {
  if (!ctx || typeof ctx !== 'object') return null;
  if (typeof ctx.used_percentage === 'number' && Number.isFinite(ctx.used_percentage)) {
    return Math.min(100, Math.max(0, ctx.used_percentage));
  }
  const size = ctx.context_window_size;
  const input = ctx.total_input_tokens;
  const output = ctx.total_output_tokens;
  if (typeof size === 'number' && size > 0 && (typeof input === 'number' || typeof output === 'number')) {
    const used = (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0);
    return Math.min(100, Math.max(0, (used / size) * 100));
  }
  return null;
}

function resetSeconds(status, now) {
  if (typeof status.reset_in_seconds === 'number' && Number.isFinite(status.reset_in_seconds)) {
    return status.reset_in_seconds;
  }
  if (typeof status.reset_time === 'string') {
    const when = Date.parse(status.reset_time);
    if (Number.isFinite(when)) return Math.round((when - now) / 1000);
  }
  return null;
}

export function selectQuotas(quota, now = Date.now()) {
  if (!quota || typeof quota !== 'object' || Array.isArray(quota)) return { items: [], disabled: 0, seen: 0 };
  const items = [];
  let disabled = 0;
  let seen = 0;
  for (const [id, status] of Object.entries(quota)) {
    if (!status || typeof status !== 'object') continue;
    seen += 1;
    if (status.disabled === true) {
      disabled += 1;
      continue;
    }
    const percent = fractionToPercent(status.remaining_fraction);
    const amount = typeof status.remaining_amount === 'number' && Number.isFinite(status.remaining_amount)
      ? status.remaining_amount
      : null;
    items.push({
      id,
      percent,
      amount,
      resetSeconds: resetSeconds(status, now),
    });
  }
  items.sort((a, b) => {
    const af = a.percent == null ? 101 : a.percent;
    const bf = b.percent == null ? 101 : b.percent;
    if (af !== bf) return af - bf;
    return (a.resetSeconds ?? Number.POSITIVE_INFINITY) - (b.resetSeconds ?? Number.POSITIVE_INFINITY);
  });
  return { items, disabled, seen };
}

function gitPlain(git, ascii) {
  if (!git) return '';
  if (git.kind === 'jj' || git.kind === 'hg') {
    return git.branch ? `${git.kind} ${git.branch}` : git.kind;
  }
  if (!git.branch) return '';
  const dirty = git.dirty ? '*' : '';
  return `${git.branch}${dirty}`;
}

function contextSpans(session, theme, width, columns, ascii) {
  const ctx = session.context_window;
  const percent = contextPercent(ctx);
  if (percent == null) return [{ text: 'ctx —', color: theme.label }];
  const color = meterColor(percent, { dangerHigh: true, theme });
  const spans = [
    { text: 'ctx ', color: theme.label },
    { text: bar(percent, width, { ascii }), color },
    { text: ` ${formatPercent(percent)}`, color, bold: true },
  ];
  if (columns >= 96 && ctx && typeof ctx === 'object') {
    const input = ctx.total_input_tokens;
    const output = ctx.total_output_tokens;
    if (typeof input === 'number' || typeof output === 'number') {
      const total = (typeof input === 'number' ? input : 0) + (typeof output === 'number' ? output : 0);
      const label = formatTokens(total);
      if (label) spans.push({ text: ` ${label}`, color: theme.label });
    }
  }
  if (columns >= 120 && ctx && typeof ctx === 'object') {
    const bits = [];
    if (typeof ctx.total_input_tokens === 'number') bits.push(`in ${formatTokens(ctx.total_input_tokens)}`);
    if (typeof ctx.total_output_tokens === 'number') bits.push(`out ${formatTokens(ctx.total_output_tokens)}`);
    const cache = ctx.current_usage && typeof ctx.current_usage === 'object'
      ? ctx.current_usage.cache_read_input_tokens
      : null;
    if (columns >= 150 && typeof cache === 'number') bits.push(`cache ${formatTokens(cache)}`);
    if (bits.length) spans.push({ text: ` (${bits.join(' ')})`, color: theme.label });
  }
  if (session.exceeds_200k_tokens === true) {
    spans.push({ text: ' >200k', color: theme.bad, bold: true });
  }
  return spans;
}

function quotaSpans(session, theme, width, columns, ascii, now) {
  const selected = selectQuotas(session.quota, now);
  if (!selected.items.length) {
    if (selected.seen > 0 && selected.disabled === selected.seen) {
      return [{ text: 'quota off', color: theme.label }];
    }
    return [{ text: 'quota —', color: theme.label }];
  }
  const limit = columns >= 120 ? 2 : 1;
  const spans = [];
  selected.items.slice(0, limit).forEach((item, index) => {
    if (index) spans.push({ text: '  ', color: theme.label });
    spans.push({ text: `${quotaLabel(item.id)} `, color: theme.label });
    if (item.percent != null) {
      const color = meterColor(item.percent, { dangerHigh: false, theme });
      spans.push({ text: bar(item.percent, width, { ascii }), color });
      spans.push({ text: ` ${formatPercent(item.percent)}`, color, bold: true });
    } else if (item.amount != null) {
      spans.push({ text: String(item.amount), color: theme.accent, bold: true });
    }
    if (item.resetSeconds != null) {
      const reset = formatReset(item.resetSeconds);
      if (reset) spans.push({ text: ` ${reset}`, color: theme.label });
    }
  });
  return spans;
}

function toolsLine(transcript, theme, ascii) {
  const tools = transcript?.tools;
  if (!Array.isArray(tools) || !tools.length) return [];
  const gap = ascii ? ' | ' : ' · ';
  const mark = ascii ? '>' : '▸';
  const recent = tools.slice(-3).reverse();
  const spans = [{ text: 'tools ', color: theme.label }];
  recent.forEach((tool, index) => {
    if (index) spans.push({ text: gap, color: theme.sep });
    const body = tool.target ? `${tool.name} ${tool.target}` : tool.name;
    if (index === 0 && tool.status === 'running') {
      spans.push({ text: `${mark} ${body}`, color: theme.tool, bold: true });
    } else if (index === 0 && tool.status === 'error') {
      spans.push({ text: `! ${body}`, color: theme.bad });
    } else {
      spans.push({ text: body, color: theme.text });
    }
  });
  return spans;
}

function subagentLine(subagents, theme, ascii) {
  if (!Array.isArray(subagents) || !subagents.length) return [];
  const items = subagents.filter((item) => item && typeof item === 'object');
  if (!items.length) return [];
  const ranked = [...items].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1));
  const gap = ascii ? ' | ' : ' · ';
  const spans = [{ text: 'sub ', color: theme.label }];
  const shown = ranked.slice(0, 3);
  shown.forEach((item, index) => {
    if (index) spans.push({ text: gap, color: theme.sep });
    const name = typeof item.name === 'string' && item.name
      ? item.name.slice(0, 24)
      : typeof item.role === 'string' && item.role
        ? item.role.slice(0, 24)
        : 'agent';
    const status = typeof item.status === 'string' ? item.status.slice(0, 16) : '';
    const running = status === 'running';
    spans.push({
      text: status ? `${name} ${status}` : name,
      color: running ? theme.sub : theme.text,
      bold: running,
    });
  });
  const extra = ranked.length - shown.length;
  if (extra > 0) spans.push({ text: ` +${extra}`, color: theme.label });
  return spans;
}

function todoLine(transcript, theme, ascii) {
  const summary = summarizeTodos(transcript);
  if (!summary) return [];
  const gap = ascii ? ' | ' : ' · ';
  if (!summary.total) {
    const text = summary.taskName
      ? `${summary.taskName}${summary.label && summary.label !== summary.taskName ? `${gap}${summary.label}` : ''}`
      : summary.label;
    return [
      { text: 'task ', color: theme.label },
      { text, color: theme.todo },
    ];
  }
  const spans = [
    { text: 'todos ', color: theme.label },
    { text: `${summary.done}/${summary.total}`, color: theme.todo, bold: true },
  ];
  if (summary.label) spans.push({ text: `${gap}${summary.label}`, color: theme.text });
  return spans;
}

function fit(spans, width, ascii, sepColor) {
  return layoutLine([{ priority: 1, keep: true, spans }], width, { sep: '', sepColor, ascii });
}

export function renderHud({
  session,
  config,
  git = null,
  transcript = null,
  env = process.env,
  now = Date.now(),
}) {
  const source = session && typeof session === 'object' ? session : {};
  const columns = terminalWidth(source, env);
  const color = useColor(config, env);
  const ascii = useAscii(config, env);
  const theme = themeFor(config.theme, config.colors);
  const sep = ascii ? ' | ' : ' · ';
  const segments = config.segments || {};
  const lineOpts = { sep, sepColor: theme.sep, ascii };
  const lines = [];

  const parts = [];
  if (segments.agent !== false) {
    const key = stateKey(source.agent_state);
    parts.push({
      priority: 100,
      keep: true,
      spans: [{
        text: formatState(source.agent_state, ascii),
        color: theme.state[key] || theme.accent,
        bold: true,
      }],
    });
    const agentName = source.agent && typeof source.agent === 'object' ? source.agent.name : '';
    if (typeof agentName === 'string' && agentName.trim()) {
      parts.push({
        priority: 45,
        spans: [{ text: agentName.trim().slice(0, 24), color: theme.accent }],
      });
    }
  }
  if (source.tool_confirmation_pending === true) {
    parts.push({
      priority: 80,
      spans: [{ text: 'confirm', color: theme.warn, bold: true }],
    });
  }
  if (segments.model) {
    const model = modelLabel(source.model);
    if (model) parts.push({ priority: 50, spans: [{ text: model, color: theme.model }] });
  }
  if (segments.project) {
    const project = projectLabel(source);
    if (project) parts.push({ priority: 30, spans: [{ text: project, color: theme.project }] });
  }
  if (segments.git) {
    const label = gitPlain(git, ascii);
    if (label) {
      const dirty = Boolean(git && git.dirty);
      parts.push({
        priority: 40,
        spans: [{ text: label, color: dirty ? theme.gitDirty : theme.git, bold: dirty }],
      });
    }
  }
  if (segments.mode) {
    const mode = modeLabel(source.cycle_mode);
    if (mode) parts.push({ priority: 22, spans: [{ text: mode, color: theme.accent }] });
  }
  if (segments.tasks && typeof source.task_count === 'number' && source.task_count > 0) {
    parts.push({
      priority: 18,
      spans: [{ text: `tasks ${Math.floor(source.task_count)}`, color: theme.label }],
    });
  }
  if (segments.sandbox && source.sandbox && source.sandbox.enabled === true) {
    parts.push({ priority: 14, spans: [{ text: 'sandbox', color: theme.warn }] });
  }

  let line1 = paint(layoutLine(parts, columns, lineOpts), color);
  if (!stripVisible(line1)) line1 = 'gravity-hud';
  lines.push(line1);

  const meters = [];
  const width = barWidth(columns, config.barWidth);
  if (segments.context) {
    meters.push({
      priority: 40,
      spans: contextSpans(source, theme, width, columns, ascii),
    });
  }
  if (segments.quota) {
    meters.push({
      priority: 30,
      spans: quotaSpans(source, theme, width, columns, ascii, now),
    });
  }
  if (segments.cost) {
    const cost = formatCost(source.cost);
    if (cost) meters.push({ priority: 10, spans: [{ text: cost, color: theme.label }] });
  }
  if (meters.length) lines.push(paint(layoutLine(meters, columns, lineOpts), color));

  if (segments.tools) {
    const spans = toolsLine(transcript, theme, ascii);
    if (spans.length) lines.push(paint(fit(spans, columns, ascii, theme.sep), color));
  }
  if (segments.subagents) {
    const spans = subagentLine(source.subagents, theme, ascii);
    if (spans.length) lines.push(paint(fit(spans, columns, ascii, theme.sep), color));
  }
  if (segments.todos) {
    const spans = todoLine(transcript, theme, ascii);
    if (spans.length) lines.push(paint(fit(spans, columns, ascii, theme.sep), color));
  }

  return lines.filter((line) => stripVisible(line)).join('\n');
}

function stripVisible(line) {
  return visibleLength(line) > 0;
}
