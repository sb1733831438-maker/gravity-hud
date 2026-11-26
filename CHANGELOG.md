# Changelog

## 0.1.0

First release of gravity-hud, a local status line for the Antigravity CLI (`agy`).

- Two-line default: agent state, model, project, git branch and dirty marker, context bar, quota bar with reset countdown.
- Optional lines for recent tools, subagents, transcript todos, and cost (`full` preset).
- Incremental transcript cache for tool activity and `task.md` checklists.
- `gravity-hud install` / `uninstall` edit `settings.json` with a backup and restore the previous command.
- Themes `gravity`, `dawn`, `ember`, and `mono`, plus an ASCII bar fallback.
- The account email is never printed. The process does not use the network.
- A git repository with no commits shows the branch name. `git status` prints `No commits yet on <branch>` (older git: `Initial commit on <branch>`).
