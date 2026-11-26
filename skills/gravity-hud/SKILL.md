---
name: gravity-hud
description: >-
  Install or configure gravity-hud, the local status line for the Antigravity
  CLI. Use when the user asks to install, uninstall, preview, theme, or
  troubleshoot the gravity-hud status line.
license: MIT
---

## Instructions

gravity-hud is a local status line. It does not call the network, and it never prints the account email.

Installing this plugin does not by itself change `settings.json`. The Antigravity plugin manifest has no status-line field, so the status line is wired by the installer below.

1. From a shell, run one of:

```bash
npx gravity-hud install
node ~/.gemini/config/plugins/gravity-hud/bin/gravity-hud.js install
```

2. If a different status line is already configured, stop and ask before re-running with `--force`.
3. Restart `agy`, or run `/statusline enable` if the command was saved with `"enabled": false`.
4. To show tools, subagents, and transcript todos, set `"preset": "full"` in `~/.config/gravity-hud/config.json` (on Windows, `%APPDATA%\gravity-hud\config.json`).

Uninstall with `gravity-hud uninstall`. That restores the previous `statusLine` value and deletes the installed copy under `~/.gemini/antigravity-cli/gravity-hud/`.

Do not read credential files, SSH keys, or the system keychain while helping with this skill. Do not add network calls to the status line.
