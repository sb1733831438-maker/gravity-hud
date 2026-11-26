# Contributing

gravity-hud is a small local program. Changes should stay fast, offline, and boring in the best way.

## Setup

Node.js 18 or newer. There are no runtime dependencies and no install step.

```bash
node scripts/lint.js
node --test
node bin/gravity-hud.js preview --preset full
```

## Expectations

- The status line must exit 0 and print something even when the session JSON is empty, truncated, or unknown.
- Do not add network calls. `scripts/lint.js` rejects `fetch`, `node:http`, `node:https`, `node:net`, and shell `exec` in `bin/` and `lib/`.
- Do not print the account `email`. Delete it in `parseSession` and keep the output scrub.
- Do not read SSH keys, credential files, or the system keychain. Transcript reads stay limited to `transcript.jsonl` and `transcript_full.jsonl`.
- Keep the default render to two lines. Extra transcript lines belong on the `full` preset or behind a segment flag.
- A typical run should stay well under the 300 ms refresh interval. Git status is capped (default 180 ms) and transcript reads are incremental.
- If you change what the sample render looks like, run `node scripts/render-hero.js`. The hero test checks that `assets/hero.svg` matches the renderer.

## Tests

`node --test` covers the renderer, transcript parser, git status parsing, and an install/uninstall against a temporary home directory. Fixtures live in `fixtures/`. Do not put real account data in them.

## Pull requests

Open a PR against `main`. Fill in the template. A bug fix that changes behavior should include a fixture or a unit test that failed before the fix.
