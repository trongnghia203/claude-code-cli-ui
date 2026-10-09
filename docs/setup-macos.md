# macOS Setup

Nuxt 3 dashboard for `~/.claude`. Dev server runs on port **3030**.

## Install

Requires macOS, Xcode Command Line Tools, and bun.

```bash
./scripts/install.sh
```

What it does:
- Symlinks `~/.local/bin/claude-ui` to `scripts/claude-ui` (live — edits apply immediately)
- Builds `~/Applications/Claude UI.app` (Swift + WKWebView native wrapper)
- Compiles `scripts/main.swift`, renders `scripts/icon.svg` to `.icns`

Ensure `~/.local/bin` is on `PATH`.

## CLI Usage

```bash
claude-ui              # start server if down, open browser
claude-ui start        # same
claude-ui start --no-open  # start without opening browser
claude-ui stop         # kill listener on port 3030
claude-ui restart
claude-ui status       # exit 1 if not running
claude-ui logs         # tail -f /tmp/claude-code-agents-ui.log
claude-ui open         # open browser (start first if down)
```

Environment overrides:
- `CLAUDE_UI_DIR` — override repo path (default: auto-detected from script location)
- `CLAUDE_UI_PORT` — default `3030`
- `CLAUDE_UI_LOG` — default `/tmp/claude-code-agents-ui.log`

Detection uses `lsof -tiTCP:3030 -sTCP:LISTEN`, not a pidfile. Server runs via `nohup bun run dev`, survives terminal close.

## Claude UI.app

Native WKWebView wrapper in `~/Applications/Claude UI.app`:

- Click icon: window opens immediately, starts dev server in background, loads `http://localhost:3030`
- Quit (Cmd+Q): stops server **only if the app started it** — a server already running via CLI stays up
- Handles JS alert/confirm/prompt dialogs, file picker, external links, Cmd+R reload, Cmd+±/0 zoom
- Window size/position remembered across restarts

Launcher log: `/tmp/claude-ui-launcher.log`

## Pitfalls

**App opened a browser tab too** — was a dispatch bug: `start --no-open` fell through to `start`. Fixed: `start` dispatches `"${2:-}"` as the flag argument.

**PATH not loaded in .app** — `.app` launchers don't source shell profile. `main.swift` sets PATH explicitly: `~/.local/bin`, `~/.bun/bin`, `/opt/homebrew/bin`.

**"Agents 0" on dashboard** — `~/.claude/agents/` empty or missing; not a launcher bug.

**`bun install` re-saves `bun.lockb`** — noise in `git status`; don't commit it.

**`/tmp` cleared on reboot** — logs gone, server stopped. Run `claude-ui` or click the app icon to restart.

## First-time bun setup

```bash
bun install
```

If `nuxt: command not found`, deps missing. If `/cli` terminal breaks, trust the native build:

```bash
bun pm trust node-pty
```
