# gravity-hud

> English | [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![CI](https://github.com/sb1733831438-maker/gravity-hud/actions/workflows/ci.yml/badge.svg)](https://github.com/sb1733831438-maker/gravity-hud/actions/workflows/ci.yml)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-339933.svg)](package.json)

**Unofficial.** gravity-hud is an independent open-source project. It is not affiliated with, endorsed by, or sponsored by Google. Antigravity is a trademark of Google LLC.

A real-time status line for the [Antigravity CLI](https://antigravity.google/docs/cli/statusline/) (`agy`). Two lines by default: what the agent is doing, which model, which repo, and how close you are to the context window and the quota reset. Turn on one more preset when you also want the tool it is running and the checklist it is working through.

## Install

```bash
npx github:sb1733831438-maker/gravity-hud install
```

That runs this repository's `gravity-hud` bin. An npm package is planned and is not published yet.

From a clone:

```bash
git clone https://github.com/sb1733831438-maker/gravity-hud.git
cd gravity-hud
node bin/gravity-hud.js install
```

Node.js 18 or newer. Restart `agy` after install, or run `/statusline enable` if the command was saved disabled.

## What you see

<!-- demo: when assets/demo.gif exists (a real agy session), show it here and keep assets/hero.svg as the fallback image. Do not link the GIF until the file is in the repo. -->

![gravity-hud preview](assets/hero.svg)

The picture is the real renderer, not a mock. It is `assets/hero.svg`, built from [`fixtures/session.json`](fixtures/session.json) and [`fixtures/transcript.jsonl`](fixtures/transcript.jsonl). The default install is the first two lines. `full` adds tools, subagents, todos, and cost. Sample git state in the preview is `main*`.

Plain text of that same render, colors removed:

```text
▸ TOOL · Gemini 4 Argon (Medium) · my-project · main* · plan · tasks 1
ctx █▓░░░░░░░░░░ 14% 149k · week ███████████░ 94% 6d11h · $0.42
tools ▸ run_command git · grep_search quota · view_file statusline.sh
sub 1 running · 1 done
todos 2/5 · Draw the context bar
```

Inspired by [claude-hud](https://github.com/jarrodwatts/claude-hud) by Jarrod Watts (MIT, Copyright (c) 2026 Jarrod Watts). gravity-hud is a separate program for `agy`, not a fork or a reskin of that project.

- Agent state, model and effort, project directory, and a live git branch with a `*` when the worktree is dirty.
- A context bar (used) and a quota bar (remaining) with a reset countdown from `reset_in_seconds` or `reset_time`.
- Narrow terminals drop lower-priority segments instead of wrapping into a mess. `TERM=dumb` and `--ascii` switch the bars to `#` and `-`.
- Optional lines, off in the default preset: the current and recent tools, subagents, and todo progress parsed from the conversation transcript.
- Transcript parsing is incremental. A small cache remembers the byte offset, so a refresh does not reread the whole log.
- Zero runtime dependencies beyond Node.js.
- Missing or unknown JSON fields degrade to a dash or a short label. The process still prints a line and exits 0, so `agy` does not disable it after repeated failures.

Preview the sample without starting `agy`:

```bash
node bin/gravity-hud.js preview
node bin/gravity-hud.js preview --preset full --width 96
node bin/gravity-hud.js < fixtures/session.json
```

## Comparison

Public projects as of November 2026. This is a feature sketch, not a scoreboard.

| | gravity-hud | [agy-powerline](https://github.com/wassim-azi/agy-powerline) | [antigravity-cli-statusline](https://github.com/AndyAWD/antigravity-cli-statusline) | [agy-hud](https://github.com/franksde/agy-hud) | [antigravity-cli-statusline](https://github.com/weby-homelab/antigravity-cli-statusline) |
| --- | --- | --- | --- | --- | --- |
| Transcript tools and todos | Yes, incremental | Session payload widgets | Large indicator set | Context, quota, model, agent | Payload fields; no transcript checklist |
| Context and quota | Bars and reset countdown | Bars, pace, and run-out forecasts | Several quota pools and locales | Compact bars | Bars, token counts, reset countdown |
| Git | Branch and dirty, from local git | Branch, ahead/behind, stash, links | Branch and dirty | Limited | Branch and dirty, from the payload or local git |
| Themes | 4 presets, 16-color | Many themes and a live editor | Locales and label styles | Icon set | 256-color with Nerd Font glyphs, plus a 16-color classic mode |
| Runtime dependencies | None beyond Node.js | None | Node.js | Node.js (bundled script) | Bash and `jq`, or Windows PowerShell |
| Install | `npx github:sb1733831438-maker/gravity-hud install` | `npx agy-powerline` | `agy plugin install` | Plugin archive | `install.sh` / `install.ps1` edits `settings.json` |
| Network | Never | None claimed by the project | Not required for the status line | Can refresh quota via `agy` | Does not upload the session payload |

gravity-hud does not forecast when a quota will run out. That is the part of agy-powerline worth using if you want pacing. This project reads the conversation transcript for tools and todos. The [Weby Homelab statusline](https://github.com/weby-homelab/antigravity-cli-statusline) is a separate Bash and PowerShell renderer with host metrics and width-packed rows.

<details>
<summary>Install details, flags, and the Antigravity plugin</summary>

`node bin/gravity-hud.js install` copies a small launcher to `~/.gemini/antigravity-cli/gravity-hud/`, backs up `~/.gemini/antigravity-cli/settings.json` when the file already exists, and sets:

```json
{
  "statusLine": {
    "type": "command",
    "command": "~/.gemini/antigravity-cli/gravity-hud/statusline.sh"
  }
}
```

On Windows the command is `statusline.cmd`. A leading `~` is expanded by `agy`.

```bash
node bin/gravity-hud.js install --dry-run
node bin/gravity-hud.js install --preset full
node bin/gravity-hud.js install --force    # replace a different status line command
node bin/gravity-hud.js uninstall          # restore the previous statusLine value
```

`install` will not replace an existing `statusLine.command` that is not gravity-hud unless you pass `--force`. Invalid JSON is left untouched. The new file is written in one rename and, on Unix, mode `0600`. Up to five timestamped backups are kept next to `settings.json`.

Plugin install places the files and a `/gravity-hud` skill. The [plugin manifest](https://antigravity.google/docs/build-plugins/) has no status-line field, so it does not edit `settings.json` by itself:

```bash
agy plugin install https://github.com/sb1733831438-maker/gravity-hud
node ~/.gemini/config/plugins/gravity-hud/bin/gravity-hud.js install
```

You can also point `/statusline` at the launcher yourself:

```text
/statusline ~/.gemini/antigravity-cli/gravity-hud/statusline.sh
```

`node bin/gravity-hud.js doctor` reports whether the status line is configured. It does not print the command string or any session field.

</details>

## Configure

The installer writes a config file the first time, and will not overwrite one that already exists.

| Platform | Path |
| --- | --- |
| macOS and Linux | `~/.config/gravity-hud/config.json` |
| Windows | `%APPDATA%\gravity-hud\config.json` |

`GRAVITY_HUD_CONFIG_DIR` and `GRAVITY_HUD_HOME` override those locations. `NO_COLOR` or `GRAVITY_HUD_ASCII=1` overrides the file for a single run.

```json
{
  "preset": "compact",
  "theme": "gravity",
  "ascii": "auto",
  "color": "auto"
}
```

The installer writes those four keys. Add a `segments` object only when you want to override the preset. A `segments` object that is a complete copy of some preset is ignored, so changing `preset` to `full` switches the layout even if an older install had written every flag out.

Presets:

| Preset | Lines |
| --- | --- |
| `minimal` | State, model, git, context, quota |
| `compact` | The default. Adds project, mode, sandbox, and background task count |
| `full` | Compact, plus tools, subagents, transcript todos, and estimated cost |

Themes are `gravity` (default), `dawn`, `ember`, and `mono`. They use the 16-color ANSI palette so they survive the `agy` TUI. `colors` can replace individual ANSI codes, for example `{ "model": "95", "good": "96" }`. `bars.width` sets the meter length (4–20). `gitTimeoutMs` clamps the local `git status` (50–2000, default 180).

Individual segment flags still win over the preset. Set `"tools": true` on `compact` if you only want the tool line.

## How todos and tools are read

`agy` does not put the checklist on stdin. The status line reads `transcript_path` from the session JSON. Each line is a step. Tool calls live on `PLANNER_RESPONSE.tool_calls` (`name`, `args`). The following step (`VIEW_FILE`, `RUN_COMMAND`, `CODE_ACTION`, `GENERIC`, …) is the result.

On agy 1.5.18 the checklist is the latest `update_steps` call. `steps` is a JSON string of `{status, title}` objects, with status `pending`, `in_progress`, or `done`. Older transcripts still work:

- `write_to_file` of `task.md` (or `ArtifactMetadata.ArtifactType` of `task`) replaces the checklist from `CodeContent`.
- `replace_file_content` and `multi_replace_file_content` update matching lines from `ReplacementContent` and `ReplacementChunks`.
- `task_boundary` supplies the current task name and status when there is no checklist yet.

Marks follow the task file convention: `[ ]` pending, `[/]` in progress, `[x]` done. Checkboxes in ordinary source files are ignored. A tool chip shows a file basename or the program name, not the full command line.

The cache is a small JSON file under the config directory. It stores the file offset plus those short labels. Files larger than 1.5 MB are tailed (512 KB) on the first read so a refresh stays cheap; later appends are read from the saved offset.

## Privacy

- The account `email` on stdin is deleted before rendering and scrubbed if it still appears in the output. There is no option to show it.
- The process does not open sockets and does not call `fetch`.
- It does not read `~/.ssh`, cloud credential files, or the keychain. Transcript paths that point at those locations are ignored.
- Nothing is uploaded. Config, cache, and the installed copy stay under your home directory.
- `doctor` reports whether a status line is configured. It does not print the command string, the settings file, or any session field.

See [SECURITY.md](SECURITY.md).

## Limits

- `vcs` in the [status line docs](https://antigravity.google/docs/cli/statusline/) lists `type` (`git`, `jj`, `hg`). The official example script also reads `branch` and `dirty`, which are not in that table. gravity-hud runs `git status` for branch and dirty state, and uses payload `branch` / `dirty` only when git does not return in time. `jj` and `hg` show the type, and a branch only when the payload includes one.
- The transcript step shape is not specified on the status line page. The parser follows captured agy 1.5.18 sessions (`update_steps`, `read_file`, `write_file`, `run_command`, `GENERIC` results) and the [hooks tool list](https://antigravity.google/docs/hooks/). Unknown argument names are skipped.
- The official payload example stores the transcript at `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`. On agy 1.5.18 that `transcript_path` is still under `~/.gemini/antigravity/brain/`, and before sign-in the conversation id is empty (`.../brain/.system_generated/logs/transcript.jsonl`), but the CLI writes the real file under `~/.gemini/antigravity-cli/brain/<id>/` (`transcript.jsonl`, with `transcript_full.jsonl` beside it). gravity-hud uses the payload path when that file exists, then the antigravity-cli path with the same id, then either brain directory. A pre-auth path with no id is skipped when the file is not there.
- `thinking` is rendered because the official example handles it. It is not in the documented `agent_state` list (`idle`, `working`, `tool_use`, `reviewing`, `authenticating`, `initializing`, `error`).
- A checklist that exists only in the head of a transcript larger than 1.5 MB can be missed until a later edit falls in the tail.
- Quota bucket ids are not a closed list. The tightest remaining bucket is shown, plus a second bucket when the terminal is at least 120 columns.

## Development

```bash
node scripts/lint.js
node --test
node scripts/render-hero.js
```

CI runs lint and `node --test` on Ubuntu, macOS, and Windows for Node.js 20 and 22. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE). Copyright (c) 2026 Binbin Sun.
