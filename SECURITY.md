# Security

gravity-hud runs on your machine, reads the session JSON `agy` already piped in, and prints a status line.

- It does not open network connections.
- It does not print the account email from the session payload.
- It does not read SSH keys, cloud credential files, or the system keychain. A transcript path is used only when the file name is `transcript.jsonl` or `transcript_full.jsonl`, and paths that look like secret stores are ignored.
- Git is invoked as `git status` with a local working directory and a timeout. The full command line from the transcript is not printed; a tool chip shows the program name or a file basename.
- `gravity-hud install` rewrites only `statusLine` inside `~/.gemini/antigravity-cli/settings.json`, after copying the file to a timestamped backup. It refuses a symlink that resolves outside `~/.gemini`, and it refuses to replace another status line command unless you pass `--force`.

If you believe a release prints private data or reads a credential file, open a bug and redact the payload before you attach it.
