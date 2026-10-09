# CHANGELOG

## Unreleased

- Add macOS launcher (`scripts/`) - Swift+WKWebView app, `claude-ui` CLI, `install.sh` [`b929e24`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b929e24)

## 2026-10-09

**Project awareness**
- Add project-local skills loading from `<workingDir>/.claude/skills/` with green `project` badge in Skills list [`5fff836`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5fff836)
- Add `GET /api/project/info` reading project `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/settings.local.json` [`5fff836`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5fff836)
- Add project config card on Dashboard surfacing which project files exist when working dir is set [`5fff836`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5fff836)

**Logs page (`/logs`)**
- Add Logs page with SSE tail of `~/.claude/daemon.log` - filters, search, pause/resume, auto-scroll [`339832a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/339832a)
- Add log source switcher (Claude Daemon vs UI dev server) [`339832a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/339832a)
- Add Logs nav link to sidebar [`339832a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/339832a)

**Token Usage dashboard (`/usage`)**
- Add token usage dashboard with stat cards, timeline chart, cost breakdown donut, top projects table, model performance table [`d512fc8`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d512fc8)
- Add Usage nav link to sidebar [`d512fc8`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d512fc8)
- Fix sort tables by cost descending [`d512fc8`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d512fc8)

**Working directory popover**
- Add `..` parent navigation entry to suggestions list [`a5b929a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a5b929a)
- Add Home button inline with title row [`a5b929a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a5b929a)
- Increase suggestions box height to 420px, sort folders alphabetically, raise limit to 20 [`a5b929a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a5b929a)
- Remove icon before `..` entry [`a5b929a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a5b929a)

**CLI project folder sidebar**
- Add pin/hide for project folders [`78e5412`](https://github.com/trongnghia203/claude-code-cli-ui/commit/78e5412)
- Add sort option (recent / name / sessions) [`78e5412`](https://github.com/trongnghia203/claude-code-cli-ui/commit/78e5412)
- Add accent background for pinned folders [`78e5412`](https://github.com/trongnghia203/claude-code-cli-ui/commit/78e5412)
- Add compact view toggle [`78e5412`](https://github.com/trongnghia203/claude-code-cli-ui/commit/78e5412)
- Fix compact mode layout - single line, row height, collapse button width [`78e5412`](https://github.com/trongnghia203/claude-code-cli-ui/commit/78e5412)

**Typography - font sizes**
- Bump sidebar nav: `13px` → `14px`, row padding `py-[7px]` → `py-[5px]` [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)
- Bump Skills list: name `13px` → `14px`, description `12px` → `13px`, padding `py-2.5` → `py-1.5` [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)
- Bump Agents, Commands, Plugins list rows: name `13px` → `14px`, description `12px` → `13px` [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)
- Bump Plugins row padding `py-2.5` → `py-1.5` [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)

**Typography - contrast & fonts**
- Replace Clash Display with Geist Sans as `--font-display` [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)
- Remove `font-display` from MCP server name chips and sidebar brand text [`7011192`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7011192)
- Bump sidebar inactive nav items `text-tertiary` → `text-secondary` [`c845624`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c845624)
- Bump sidebar bottom items (Search, Claude, Light mode, Set project directory) to `text-secondary` [`c845624`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c845624)
- Bump `CLAUDE CODE` subtitle `text-disabled` → `text-tertiary` [`c845624`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c845624)
- Bump `.claude` path footer `9px` → `10px`, `text-disabled` → `text-tertiary` [`c845624`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c845624)

**MCP servers**
- Add capability discovery and support for modern HTTP transport [`7890d20`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7890d20)
- Fix MCP permission display [`7890d20`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7890d20)
- Fix stdio transport load capabilities [`7890d20`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7890d20)

**Chat interface**
- Add git panel and file explorer sidebar [`6422210`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6422210)
- Add AskUserQuestion UI with permission answer flow [`67da2ab`](https://github.com/trongnghia203/claude-code-cli-ui/commit/67da2ab)
- Fix live session sync and active indicator [`b2f3961`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b2f3961)
- Fix chat message deduplication [`9dc8a1f`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9dc8a1f)

**Agents / Skills / Project Artifacts**
- Add clickable agents/skills in project artifacts and project modal [`9423006`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9423006)
- Add file location display in Skill and Agent detail pages [`9c6aa6c`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9c6aa6c)
- Fix skill loading from non-standard project artifact paths [`6b33625`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6b33625)

**Misc**
- Standardize dev server port to 3030 [`9dc8a1f`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9dc8a1f)
- Add CI setup [`67da2ab`](https://github.com/trongnghia203/claude-code-cli-ui/commit/67da2ab)
