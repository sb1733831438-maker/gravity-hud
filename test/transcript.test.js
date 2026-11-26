import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  applyLine,
  emptyTranscript,
  loadTranscript,
  parseChecklist,
  reduceRecord,
  summarizeTodos,
  visibleTools,
} from '../lib/transcript.js';
import { isSafeTranscript, resolveTranscriptPath } from '../lib/session.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('checklist marks map to done, active, and pending', () => {
  const items = parseChecklist('- [x] one\n- [/] two\n- [ ] three\n');
  assert.deepEqual(items.map((item) => item.status), ['done', 'active', 'pending']);
});

test('task.md writes replace the todo list and later edits merge', () => {
  const state = emptyTranscript();
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [{
      name: 'write_to_file',
      args: {
        TargetFile: '/brain/task.md',
        CodeContent: '- [ ] Draw the context bar\n- [ ] Quota countdown\n',
        IsArtifact: true,
        ArtifactMetadata: { ArtifactType: 'task' },
      },
    }],
  });
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [{
      name: 'replace_file_content',
      args: {
        TargetFile: '/brain/task.md',
        TargetContent: '- [ ] Draw the context bar',
        ReplacementContent: '- [/] Draw the context bar',
      },
    }],
  });
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [{
      name: 'multi_replace_file_content',
      args: {
        TargetFile: '/brain/task.md',
        ReplacementChunks: [{
          TargetContent: '- [/] Draw the context bar',
          ReplacementContent: '- [x] Draw the context bar',
        }],
      },
    }],
  });
  const summary = summarizeTodos(state);
  assert.equal(summary.done, 1);
  assert.equal(summary.total, 2);
  assert.equal(summary.label, 'Quota countdown');
});

test('checkboxes in ordinary files are ignored', () => {
  const state = emptyTranscript();
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [{
      name: 'write_to_file',
      args: {
        TargetFile: '/repo/README.md',
        CodeContent: '- [x] not a task\n- [ ] still not\n',
      },
    }],
  });
  assert.equal(state.todos.items.length, 0);
});

test('tool calls pair with the following result step', () => {
  const state = emptyTranscript();
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [
      { name: 'view_file', args: { AbsolutePath: '/repo/src/app.js' } },
      { name: 'run_command', args: { CommandLine: 'npm test --watch' } },
    ],
  });
  assert.equal(state.tools[0].status, 'running');
  reduceRecord(state, { type: 'VIEW_FILE', status: 'DONE', content: 'ok' });
  assert.equal(state.tools[0].status, 'done');
  assert.equal(state.tools[0].target, 'app.js');
  assert.equal(state.tools[1].status, 'running');
  assert.equal(state.tools[1].target, 'npm');
  reduceRecord(state, { type: 'RUN_COMMAND', status: 'ERROR' });
  assert.equal(state.tools[1].status, 'error');
});

test('task_boundary updates the current task and is not a tool chip', () => {
  const state = emptyTranscript();
  reduceRecord(state, {
    type: 'PLANNER_RESPONSE',
    tool_calls: [{
      name: 'task_boundary',
      args: { TaskName: 'Build the HUD', TaskStatus: 'Reading docs', Mode: 'EXECUTION' },
    }],
  });
  assert.equal(visibleTools(state.tools).length, 0);
  assert.equal(summarizeTodos(state).taskName, 'Build the HUD');
  assert.equal(summarizeTodos(state).label, 'Reading docs');
});

test('broken transcript lines are skipped', () => {
  const state = emptyTranscript();
  applyLine(state, '{');
  applyLine(state, '{"type":"PLANNER_RESPONSE","tool_calls":[{"name":"list_dir","args":{"DirectoryPath":"/repo/src"}}]}');
  assert.equal(state.tools[0].name, 'list_dir');
  assert.equal(state.tools[0].target, 'src');
});

test('incremental reads only new bytes', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gravity-hud-tx-'));
  const file = path.join(dir, 'transcript.jsonl');
  const cache = path.join(dir, 'cache');
  try {
    writeFileSync(file, `${JSON.stringify({
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'view_file', args: { AbsolutePath: '/repo/a.js' } }],
    })}\n`);
    const first = loadTranscript(file, cache);
    assert.equal(first.tools[0].target, 'a.js');
    const cached = JSON.parse(readFileSync(path.join(cache, `${requireHash(file)}.json`), 'utf8'));
    assert.equal(cached.offset, Buffer.byteLength(readFileSync(file)));
    writeFileSync(file, `${readFileSync(file, 'utf8')}${JSON.stringify({
      type: 'VIEW_FILE',
      status: 'DONE',
    })}\n${JSON.stringify({
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'grep_search', args: { Query: 'quota', SearchPath: '/repo' } }],
    })}\n`, { flag: 'w' });
    const second = loadTranscript(file, cache);
    assert.equal(second.tools.at(-1).name, 'grep_search');
    assert.equal(second.tools[0].status, 'done');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a large transcript uses the tail and still sees a late checklist', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'gravity-hud-big-'));
  const file = path.join(dir, 'transcript.jsonl');
  try {
    const early = `${JSON.stringify({
      type: 'PLANNER_RESPONSE',
      tool_calls: [{ name: 'early_tool', args: {} }],
    })}\n`;
    const filler = `${JSON.stringify({ type: 'GENERIC', step_index: 1 })}\n`.repeat(80000);
    const late = `${JSON.stringify({
      type: 'PLANNER_RESPONSE',
      tool_calls: [{
        name: 'write_to_file',
        args: {
          TargetFile: '/brain/task.md',
          CodeContent: '- [x] one\n- [/] two\n',
          ArtifactMetadata: { ArtifactType: 'task' },
        },
      }],
    })}\n`;
    writeFileSync(file, early + filler + late);
    const state = loadTranscript(file, null);
    assert.ok(!state.tools.some((tool) => tool.name === 'early_tool'));
    assert.equal(summarizeTodos(state).done, 1);
    assert.equal(summarizeTodos(state).label, 'two');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('transcript paths must be transcript files and must not look like secrets', () => {
  assert.equal(isSafeTranscript('/tmp/work/transcript.jsonl'), true);
  assert.equal(isSafeTranscript('/home/ada/.ssh/transcript.jsonl'), false);
  assert.equal(isSafeTranscript('/tmp/id_rsa'), false);
  assert.equal(isSafeTranscript('/tmp/notes.txt'), false);
  const home = mkdtempSync(path.join(tmpdir(), 'gravity-hud-home-'));
  try {
    const id = 'conv-1';
    const file = path.join(home, '.gemini', 'antigravity', 'brain', id, '.system_generated', 'logs', 'transcript.jsonl');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, '{}\n');
    const resolved = resolveTranscriptPath({ conversation_id: id }, { GRAVITY_HUD_HOME: home });
    assert.equal(resolved, file);
    assert.equal(resolveTranscriptPath({ conversation_id: '../secrets' }, { GRAVITY_HUD_HOME: home }), '');
    assert.equal(resolveTranscriptPath({ transcript_path: path.join(home, '.ssh', 'transcript.jsonl') }, { GRAVITY_HUD_HOME: home }), '');
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('JSON-encoded tool arguments and update_steps replace the checklist', () => {
  const state = emptyTranscript();
  reduceRecord(state, {
    step_index: '2',
    input_tokens: '10',
    output_tokens: '3',
    type: 'PLANNER_RESPONSE',
    tool_calls: [
      {
        name: 'update_steps',
        args: {
          steps: JSON.stringify([
            { status: 'done', title: 'Read README.md' },
            { status: 'done', title: 'Create hello.py' },
            { status: 'in_progress', title: 'Run hello.py with python3' },
            { status: 'pending', title: 'Subagent review of hello.py' },
          ]),
        },
      },
      {
        name: 'read_file',
        args: { Path: JSON.stringify('/workspace/agy-proj/README.md') },
      },
    ],
  });
  reduceRecord(state, { type: 'GENERIC', status: 'DONE' });
  reduceRecord(state, { type: 'GENERIC', status: 'DONE' });
  assert.equal(visibleTools(state.tools)[0].target, 'README.md');
  assert.equal(visibleTools(state.tools)[0].status, 'done');
  const summary = summarizeTodos(state);
  assert.equal(summary.done, 2);
  assert.equal(summary.total, 4);
  assert.equal(summary.label, 'Run hello.py with python3');
  assert.equal(visibleTools(state.tools).some((tool) => tool.name === 'update_steps'), false);
});

test('signed-in transcript keeps short targets and the latest checklist', () => {
  const state = loadTranscript(path.join(root, 'fixtures', 'transcript-signed-in.jsonl'), null);
  const visible = visibleTools(state.tools);
  assert.ok(visible.some((tool) => tool.name === 'read_file' && tool.target === 'README.md'));
  assert.ok(visible.some((tool) => tool.name === 'write_file' && tool.target === 'hello.py'));
  assert.ok(visible.some((tool) => tool.name === 'run_command' && tool.target === 'python3' && tool.status === 'done'));
  assert.ok(visible.some((tool) => tool.name === 'schedule' && tool.status === 'running'));
  assert.equal(visible.some((tool) => tool.name === 'update_steps' || tool.name === 'manage_task' || tool.name === 'manage_subagents'), false);
  assert.ok(state.tools.some((tool) => tool.name === 'manage_task' && tool.status === 'error'));
  assert.deepEqual(state.todos.items.map((item) => item.title), [
    "Append print('bye') and run hello.py",
    'Subagent lists folder files',
  ]);
  assert.equal(summarizeTodos(state).done, 2);
  assert.equal(summarizeTodos(state).total, 2);
});

test('a missing payload transcript path falls back to the antigravity-cli file', () => {
  const home = mkdtempSync(path.join(tmpdir(), 'gravity-hud-brain-'));
  try {
    const id = '51b46fa2-297a-491e-8dfc-5220ebd0ea27';
    const cliFile = path.join(home, '.gemini', 'antigravity-cli', 'brain', id, '.system_generated', 'logs', 'transcript.jsonl');
    mkdirSync(path.dirname(cliFile), { recursive: true });
    writeFileSync(cliFile, '{}\n');
    const given = path.join(home, '.gemini', 'antigravity', 'brain', id, '.system_generated', 'logs', 'transcript.jsonl');
    const resolved = resolveTranscriptPath({
      conversation_id: id,
      transcript_path: given,
    }, { GRAVITY_HUD_HOME: home });
    assert.equal(resolved, cliFile);
    const fullOnly = path.join(home, '.gemini', 'antigravity-cli', 'brain', 'other-id', '.system_generated', 'logs', 'transcript_full.jsonl');
    mkdirSync(path.dirname(fullOnly), { recursive: true });
    writeFileSync(fullOnly, '{}\n');
    assert.equal(
      resolveTranscriptPath({ conversation_id: 'other-id' }, { GRAVITY_HUD_HOME: home }),
      fullOnly,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

function requireHash(filePath) {
  return createHash('sha256').update(filePath).digest('hex').slice(0, 16);
}
