import { readFileSync } from 'node:fs';
import path from 'node:path';
import { resolveConfig } from './config.js';
import { packageRoot } from './paths.js';
import { renderHud } from './render.js';
import { parseSession } from './session.js';
import { loadTranscript } from './transcript.js';

export const SAMPLE_GIT = { kind: 'git', branch: 'main', dirty: true };

export function samplePaths(root = packageRoot()) {
  return {
    session: path.join(root, 'fixtures', 'session.json'),
    transcript: path.join(root, 'fixtures', 'transcript.jsonl'),
  };
}

export function renderSample({
  preset = 'compact',
  width = 100,
  color = true,
  ascii = false,
  root = packageRoot(),
  env = process.env,
} = {}) {
  const paths = samplePaths(root);
  const { session, redact } = parseSession(readFileSync(paths.session, 'utf8'));
  session.terminal_width = width;
  const config = resolveConfig({ preset, color, ascii });
  const transcript = (config.segments.tools || config.segments.todos)
    ? loadTranscript(paths.transcript, null)
    : null;
  const text = renderHud({
    session,
    config,
    git: SAMPLE_GIT,
    transcript,
    env,
    now: Date.parse('2026-07-01T00:00:00Z'),
  });
  return { text, redact, session };
}
