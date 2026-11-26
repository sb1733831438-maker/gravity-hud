import { existsSync } from 'node:fs';
import path from 'node:path';
import { homeDir } from './paths.js';

const SENSITIVE = /[/\\](\.ssh|\.gnupg|\.aws|keychains?|Library[/\\]Keychains)[/\\]|id_rsa|id_ed25519|id_ecdsa|\.pem$|credentials|\.netrc|secret/i;

export function isSafeTranscript(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim() || filePath.includes('\0')) return false;
  const base = path.basename(filePath);
  if (base !== 'transcript.jsonl' && base !== 'transcript_full.jsonl') return false;
  if (SENSITIVE.test(filePath)) return false;
  return true;
}

export function parseSession(raw) {
  const empty = { session: {}, redact: [] };
  if (typeof raw !== 'string' || !raw.trim()) return empty;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return empty;
  const redact = [];
  if (typeof data.email === 'string' && data.email) {
    redact.push(data.email);
    delete data.email;
  }
  return { session: data, redact };
}

export function scrub(text, redact) {
  let out = String(text);
  for (const secret of redact || []) {
    if (typeof secret === 'string' && secret.length >= 3) out = out.split(secret).join('');
  }
  return out;
}

function safeConversationId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/.test(value);
}

export function resolveTranscriptPath(session, env = process.env) {
  const source = session && typeof session === 'object' ? session : {};
  const given = typeof source.transcript_path === 'string' ? source.transcript_path.trim() : '';
  if (given) return isSafeTranscript(given) ? given : '';
  const id = safeConversationId(source.conversation_id)
    ? source.conversation_id
    : safeConversationId(source.session_id)
      ? source.session_id
      : '';
  if (!id) return '';
  const home = homeDir(env);
  const candidates = [
    path.join(home, '.gemini', 'antigravity', 'brain', id, '.system_generated', 'logs', 'transcript.jsonl'),
    path.join(home, '.gemini', 'antigravity-cli', 'brain', id, '.system_generated', 'logs', 'transcript.jsonl'),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return '';
}
