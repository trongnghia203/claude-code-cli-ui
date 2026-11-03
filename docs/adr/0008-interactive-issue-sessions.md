# ADR 0008: Interactive Claude Code sessions started from an issue

- Status: Accepted (CLI and plugin done, "Start iTerm2" button not built yet)
- Date: 2026-11-03

## Context

Issue runs are headless and one-shot (ADR 0001). Long jobs, like a PaaS upgrade, need a person in the loop for hours, often in
more than one repo. After triage the user wants a normal Claude Code session that starts with the issue's context and writes the
result back when done.

## Decision

- `claude-ui session ISS-n [--cwd DIR] [--label L] [--print]` (`scripts/claude-ui-session.mjs`) starts an interactive `claude`.
  - Context file: description plus live comments only (ADR 0009, `get --live`). Folded comments are not sent. A hint says how to read them.
  - Passed with `--append-system-prompt-file`. A short first prompt asks for a 3-line summary.
  - cwd is the issue's project, or `--cwd`. Two sessions on one issue can run in two repos. `--label` names each one.
  - Env: `CLAUDE_UI_ISSUE`, `CLAUDE_UI_SESSION_LABEL`, `CLAUDE_UI_URL`.
  - On exit it prints a note if the session changed neither the description nor the comments.
- A plugin in `plugins/claude-ui/`, loaded with `--plugin-dir`, so only these sessions get it:
  - `/claude-ui:issue-distill`: read `get --live`, draft a new description, preview only.
  - `/claude-ui:issue-update`: write the draft with `fold --ids <ids read> --if-hash <hash>`.
  - `/claude-ui:issue-comment`: post a short result comment, prefixed with the label.
  - `/claude-ui:issue-wrap`: distill, ask, update, comment.
- Write-back is a slash command the user runs, not an exit hook.

## Consequences

- The session that did the work writes the distill. No second `claude -p` run, no tokens spent re-reading it.
- Closing the terminal without a wrap loses nothing already on the issue, and nothing new is saved. The exit note is the only guard.
- Two sessions fold only the comment ids they read, and `--if-hash` returns 409 if the description moved. The session merges and retries.
- The plugin is named `claude-ui`, which the marketplace validator reserves (`claude-` prefix). It works with `--plugin-dir`.
  Submitting it to a marketplace needs a rename, and the command namespace changes with it.
- Planned: a "Start iTerm2" button with a project picker. It runs this command through `osascript`.
