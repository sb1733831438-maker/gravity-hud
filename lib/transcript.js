import { createHash } from 'node:crypto';
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

const FULL_PARSE_MAX = 1_500_000;
const TAIL_BYTES = 512 * 1024;
const MAX_READ = 768 * 1024;
const MAX_LINE = 1_000_000;
const NON_RESULT = new Set([
  'USER_INPUT',
  'PLANNER_RESPONSE',
  'CONVERSATION_HISTORY',
  'CHECKPOINT',
  'SYSTEM_MESSAGE',
]);

const CHECK = /^[ \t]*(?:[-*]|\d+[.)])[ \t]+\[([ xX/~!-])\][ \t]+(.+?)\s*$/gm;

export function emptyTranscript() {
  return { tools: [], todos: { items: [] }, task: { name: '', status: '' } };
}

export function parseChecklist(text) {
  if (typeof text !== 'string' || !text.includes('[')) return [];
  const items = [];
  const re = new RegExp(CHECK.source, 'gm');
  let match = re.exec(text);
  while (match) {
    const mark = match[1];
    let status = 'pending';
    if (mark === 'x' || mark === 'X') status = 'done';
    else if (mark === '/' || mark === '~' || mark === '-' || mark === '!') status = 'active';
    const title = match[2].trim().slice(0, 80);
    if (title) items.push({ status, title });
    if (items.length >= 40) break;
    match = re.exec(text);
  }
  return items;
}

function normTitle(title) {
  return title.toLowerCase().replace(/\s+/g, ' ').trim();
}

function mergeItem(items, item) {
  const key = normTitle(item.title);
  const index = items.findIndex((entry) => normTitle(entry.title) === key);
  if (index >= 0) {
    items[index] = { status: item.status, title: item.title };
    return;
  }
  if (items.length < 40) items.push({ status: item.status, title: item.title });
}

function applyPairs(items, oldItems, newItems) {
  if (!newItems.length) return;
  if (!items.length) {
    items.push(...newItems.slice(0, 40));
    return;
  }
  if (oldItems.length && oldItems.length === newItems.length) {
    for (let i = 0; i < newItems.length; i += 1) {
      const key = normTitle(oldItems[i].title);
      const index = items.findIndex((entry) => normTitle(entry.title) === key);
      if (index >= 0) items[index] = { ...newItems[i] };
      else mergeItem(items, newItems[i]);
    }
    return;
  }
  for (const item of newItems) mergeItem(items, item);
}

function asText(value) {
  return typeof value === 'string' ? value : '';
}

function artifactType(args) {
  let meta = args.ArtifactMetadata ?? args.artifactMetadata ?? args.artifact_metadata;
  if (typeof meta === 'string') {
    try {
      meta = JSON.parse(meta);
    } catch {
      return '';
    }
  }
  if (!meta || typeof meta !== 'object') return '';
  const value = meta.ArtifactType ?? meta.artifactType ?? meta.artifact_type ?? meta.type;
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function isTaskPath(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const base = value.replace(/\\/g, '/').split('/').pop();
  return base === 'task.md' || base === 'tasks.md';
}

function isTaskArgs(args) {
  const target = args.TargetFile ?? args.Path ?? args.target_file ?? args.file_path ?? args.path;
  return isTaskPath(target) || artifactType(args) === 'task';
}

function chunkTexts(chunk) {
  if (typeof chunk === 'string') return { oldText: '', newText: chunk };
  if (!chunk || typeof chunk !== 'object') return { oldText: '', newText: '' };
  return {
    oldText: asText(chunk.TargetContent ?? chunk.target_content),
    newText: asText(chunk.ReplacementContent ?? chunk.replacement_content ?? chunk.CodeContent),
  };
}

function absorbFileEdit(state, name, args) {
  if (!args || typeof args !== 'object' || !isTaskArgs(args)) return;
  if (name === 'write_to_file' || name === 'write_file') {
    const content = asText(args.CodeContent ?? args.Content ?? args.code_content ?? args.contents ?? args.Contents);
    state.todos.items = parseChecklist(content).slice(0, 40);
    return;
  }
  const items = state.todos.items;
  applyPairs(
    items,
    parseChecklist(asText(args.TargetContent)),
    parseChecklist(asText(args.ReplacementContent)),
  );
  const chunks = args.ReplacementChunks ?? args.replacement_chunks;
  if (Array.isArray(chunks)) {
    for (const chunk of chunks) {
      const texts = chunkTexts(chunk);
      applyPairs(items, parseChecklist(texts.oldText), parseChecklist(texts.newText));
    }
  }
  if (items.length > 40) items.length = 40;
}

const HIDDEN_TOOLS = new Set(['task_boundary', 'update_steps', 'manage_task', 'manage_subagents']);

export function visibleTools(tools) {
  return (tools || []).filter((tool) => tool && !HIDDEN_TOOLS.has(String(tool.name || '').toLowerCase()));
}

function decodeJsonString(value) {
  if (typeof value !== 'string' || value.length > 100000) return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function decodeArgs(args) {
  let source = args;
  if (typeof source === 'string') source = decodeJsonString(source);
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};
  const decoded = {};
  for (const [key, value] of Object.entries(source)) decoded[key] = decodeJsonString(value);
  return decoded;
}

function absorbUpdateSteps(state, args) {
  let steps = args.steps;
  if (typeof steps === 'string') steps = decodeJsonString(steps);
  if (!Array.isArray(steps) || !steps.length) return;
  const items = [];
  for (const step of steps) {
    if (!step || typeof step !== 'object') continue;
    const title = typeof step.title === 'string' ? step.title.trim().slice(0, 80) : '';
    if (!title) continue;
    const raw = typeof step.status === 'string' ? step.status.toLowerCase() : '';
    let status = 'pending';
    if (raw === 'done' || raw === 'completed') status = 'done';
    else if (raw === 'in_progress' || raw === 'active') status = 'active';
    items.push({ status, title });
    if (items.length >= 40) break;
  }
  if (items.length) state.todos.items = items;
}

function shortPath(value) {
  const base = String(value).replace(/\\/g, '/').split('/').filter(Boolean).pop() || String(value);
  return base.slice(0, 36);
}

function firstString(args, keys) {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function shortQuery(query) {
  const one = query.replace(/\s+/g, ' ').trim().slice(0, 24);
  if (!one || /^[A-Za-z0-9+/=_-]{20,}$/.test(one)) return '';
  return one;
}

function toolTarget(name, args) {
  if (!args || typeof args !== 'object') return '';
  const lname = String(name || '').toLowerCase();
  if (lname === 'schedule') {
    const seconds = Number(args.DurationSeconds ?? args.duration_seconds);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60}m` : `${seconds}s`;
    }
    return '';
  }
  if (lname === 'invoke_subagent' || lname === 'send_message') {
    const role = firstString(args, ['Role', 'role']);
    if (role && [...role].length <= 24 && !role.includes('\n')) return role;
    return '';
  }
  if (lname === 'grep_search' || lname === 'search_web' || lname === 'find_by_name' || lname === 'read_url_content') {
    const query = firstString(args, ['Query', 'query', 'Pattern', 'Url', 'url']);
    if (query) return lname === 'read_url_content' ? shortPath(query) : shortQuery(query);
  }
  const file = firstString(args, [
    'Path',
    'AbsolutePath',
    'TargetFile',
    'DirectoryPath',
    'SearchPath',
    'SearchDirectory',
    'file_path',
    'path',
  ]);
  if (file) return shortPath(file);
  const command = firstString(args, ['CommandLine', 'Command', 'command']);
  if (command) return shortPath(command.trim().split(/\s+/)[0] || '').slice(0, 24);
  const query = firstString(args, ['Query', 'query', 'Pattern']);
  if (!query) return '';
  return shortQuery(query);
}

function pushTool(state, name, args) {
  state.tools.push({
    name: String(name || 'tool').slice(0, 40),
    target: toolTarget(name, args),
    status: 'running',
    settled: false,
  });
  if (state.tools.length > 48) state.tools.splice(0, state.tools.length - 48);
}

export function reduceRecord(state, record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return state;
  const type = typeof record.type === 'string' ? record.type : '';
  const calls = Array.isArray(record.tool_calls) ? record.tool_calls : [];
  for (const call of calls) {
    if (!call || typeof call !== 'object') continue;
    const name = typeof call.name === 'string' && call.name ? call.name : 'tool';
    const args = decodeArgs(call.args);
    const lname = name.toLowerCase();
    if (lname === 'task_boundary') {
      const taskName = args.TaskName ?? args.task_name ?? args.taskName;
      const taskStatus = args.TaskStatus ?? args.task_status ?? args.taskStatus;
      if (typeof taskName === 'string' && taskName && taskName !== '%SAME%') {
        state.task.name = taskName.slice(0, 80);
      }
      if (typeof taskStatus === 'string' && taskStatus && taskStatus !== '%SAME%') {
        state.task.status = taskStatus.slice(0, 80);
      }
    }
    if (lname === 'update_steps') absorbUpdateSteps(state, args);
    if (lname === 'write_to_file' || lname === 'replace_file_content' || lname === 'multi_replace_file_content' || lname === 'write_file') {
      absorbFileEdit(state, lname, args);
    }
    pushTool(state, name, args);
  }
  if (type && !NON_RESULT.has(type)) {
    const running = state.tools.find((tool) => tool.status === 'running' && !tool.settled);
    if (running) {
      running.settled = true;
      if (record.status === 'ERROR' || record.status === 'FAILED') running.status = 'error';
      else if (record.status === 'RUNNING') running.status = 'running';
      else running.status = 'done';
    }
  }
  return state;
}

export function applyLine(state, line) {
  if (!line || line.length > MAX_LINE) return state;
  const trimmed = line.trim();
  if (!trimmed) return state;
  let record;
  try {
    record = JSON.parse(trimmed);
  } catch {
    return state;
  }
  return reduceRecord(state, record);
}

function splitLines(buffer) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < buffer.length; i += 1) {
    if (buffer[i] !== 0x0a) continue;
    let end = i;
    if (end > start && buffer[end - 1] === 0x0d) end -= 1;
    lines.push(buffer.toString('utf8', start, end));
    start = i + 1;
  }
  return { lines, rest: Buffer.from(buffer.subarray(start)) };
}

function sanitizeState(value) {
  const state = emptyTranscript();
  if (!value || typeof value !== 'object') return state;
  if (Array.isArray(value.tools)) {
    for (const tool of value.tools.slice(-48)) {
      if (!tool || typeof tool.name !== 'string') continue;
      state.tools.push({
        name: tool.name.slice(0, 40),
        target: typeof tool.target === 'string' ? tool.target.slice(0, 40) : '',
        status: tool.status === 'running' || tool.status === 'error' ? tool.status : 'done',
        settled: tool.settled === true || tool.status === 'done' || tool.status === 'error',
      });
    }
  }
  if (Array.isArray(value.todos?.items)) {
    for (const item of value.todos.items.slice(0, 40)) {
      if (!item || typeof item.title !== 'string' || !item.title) continue;
      const status = item.status === 'done' || item.status === 'active' ? item.status : 'pending';
      state.todos.items.push({ status, title: item.title.slice(0, 80) });
    }
  }
  if (typeof value.task?.name === 'string') state.task.name = value.task.name.slice(0, 80);
  if (typeof value.task?.status === 'string') state.task.status = value.task.status.slice(0, 80);
  return state;
}

function cacheFile(cacheDirectory, filePath) {
  const hash = createHash('sha256').update(filePath).digest('hex').slice(0, 16);
  return path.join(cacheDirectory, `${hash}.json`);
}

function readCache(cacheDirectory, filePath) {
  if (!cacheDirectory) return null;
  try {
    const parsed = JSON.parse(readFileSync(cacheFile(cacheDirectory, filePath), 'utf8'));
    if (!parsed || parsed.path !== filePath || typeof parsed.offset !== 'number') return null;
    return {
      offset: parsed.offset,
      size: parsed.size,
      mtimeMs: parsed.mtimeMs,
      state: sanitizeState(parsed.state),
    };
  } catch {
    return null;
  }
}

function writeCacheFile(cacheDirectory, filePath, payload) {
  if (!cacheDirectory) return;
  try {
    mkdirSync(cacheDirectory, { recursive: true });
    const file = cacheFile(cacheDirectory, filePath);
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify({ path: filePath, ...payload }));
    try {
      renameSync(tmp, file);
    } catch {
      if (existsSync(file)) unlinkSync(file);
      renameSync(tmp, file);
    }
  } catch {
    /* Cache misses fall back to reading the transcript. */
  }
}

export function loadTranscript(filePath, cacheDirectory) {
  const fresh = emptyTranscript();
  if (typeof filePath !== 'string' || !filePath) return fresh;
  let stat;
  try {
    stat = statSync(filePath);
  } catch {
    return fresh;
  }
  if (!stat.isFile() || stat.size < 0) return fresh;

  const cache = readCache(cacheDirectory, filePath);
  const cacheUsable = Boolean(
    cache
    && cache.offset >= 0
    && cache.offset <= stat.size
    && (cache.size < stat.size || (cache.size === stat.size && cache.mtimeMs === stat.mtimeMs)),
  );
  if (cacheUsable && cache.offset === stat.size && cache.size === stat.size) return cache.state;

  let offset = 0;
  let state = fresh;
  let align = false;
  if (cacheUsable && cache.offset > 0) {
    offset = cache.offset;
    state = cache.state;
  } else if (stat.size > FULL_PARSE_MAX) {
    offset = Math.max(0, stat.size - TAIL_BYTES);
    align = offset > 0;
  }

  let fd;
  try {
    fd = openSync(filePath, 'r');
    let pos = offset;
    let pending = Buffer.alloc(0);
    let aligned = !align;
    const end = Math.min(stat.size, offset + MAX_READ);
    while (pos < end) {
      const want = Math.min(256 * 1024, end - pos);
      const buf = Buffer.alloc(want);
      const n = readSync(fd, buf, 0, want, pos);
      if (n <= 0) break;
      pos += n;
      let chunk = buf.subarray(0, n);
      if (!aligned) {
        const nl = chunk.indexOf(0x0a);
        if (nl < 0) continue;
        chunk = chunk.subarray(nl + 1);
        aligned = true;
      }
      pending = pending.length ? Buffer.concat([pending, chunk]) : Buffer.from(chunk);
      const split = splitLines(pending);
      pending = split.rest;
      for (const line of split.lines) applyLine(state, line);
      if (pending.length > MAX_LINE) pending = Buffer.alloc(0);
    }
    const consumedTo = pos - pending.length;
    writeCacheFile(cacheDirectory, filePath, {
      offset: Math.max(0, consumedTo),
      size: stat.size,
      mtimeMs: stat.mtimeMs,
      state,
    });
    return state;
  } catch {
    return state;
  } finally {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        /* ignore */
      }
    }
  }
}

export function summarizeTodos(transcript) {
  const items = transcript?.todos?.items || [];
  const task = transcript?.task || { name: '', status: '' };
  if (!items.length && !task.name && !task.status) return null;
  const done = items.filter((item) => item.status === 'done').length;
  const active = items.find((item) => item.status === 'active');
  const pending = items.find((item) => item.status === 'pending');
  return {
    done,
    total: items.length,
    label: active?.title || task.status || pending?.title || task.name || '',
    taskName: task.name || '',
  };
}
