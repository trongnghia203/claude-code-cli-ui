# CHANGELOG

## Unreleased

- Add macOS launcher (`scripts/`) - Swift+WKWebView app, `claude-ui` CLI, `install.sh` [`b929e24`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b929e24)

**Memory page (`/memory`)**
- Add Memory page to preview and edit `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, auto-memory files; Global and Project scopes, opens on Project [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Add Preview / Edit / Diff tabs - line diff with word-level highlight, removed line before added [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Add Source Control panel under the file list - staged and changed memory files, stage / unstage / discard, commit, commit and push, push [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Limit git actions to listed memory files, never force push, confirm before pushing `main` / `master` [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Fix Improve with Claude - 22s to ~6s, plain text result, no raw JSON in the file [`d270f9b`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d270f9b)

**MCP**
- Add per-project switch to launch Claude with `--strict-mcp-config --mcp-config .mcp.json`, applied to chat and terminal [`fea2b14`](https://github.com/trongnghia203/claude-code-cli-ui/commit/fea2b14)
- Group MCP Servers page into Project MCPs and Global MCPs, add read-only plugin and local groups, add `Add project server` [`fea2b14`](https://github.com/trongnghia203/claude-code-cli-ui/commit/fea2b14)
- Add `GET /api/mcp/sources` listing servers per source [`fea2b14`](https://github.com/trongnghia203/claude-code-cli-ui/commit/fea2b14)
- Fix terminal not finding the `claude` binary - fall back to `which claude` [`fea2b14`](https://github.com/trongnghia203/claude-code-cli-ui/commit/fea2b14)
- Fix local slash commands like `/mcp` showing no output in chat and history [`914d01b`](https://github.com/trongnghia203/claude-code-cli-ui/commit/914d01b)

**Chat interface**
- Add live model list from the installed Claude CLI, grouped selector with older models collapsed [`ebf894d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ebf894d)
- Add permission modes `auto` and `dontAsk` [`ebf894d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ebf894d)
- Fix context ring - use last API call usage and the SDK context window, recalc on model switch [`ebf894d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ebf894d)
- Render shell commands, system messages and `[Image: source: ...]` in chat [`1247aa8`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1247aa8)
- Fix uneven padding in user message bubbles, copy button floats beside the bubble [`628a862`](https://github.com/trongnghia203/claude-code-cli-ui/commit/628a862)
- Fix medium-effort gauge icon sitting off-centre in its circle [`af96760`](https://github.com/trongnghia203/claude-code-cli-ui/commit/af96760)
- Fix deleting an already-removed session showing a not-found error, drop it from the list instead [`d53d204`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d53d204)

**Sidebar and navigation**
- Move project switcher to the sidebar top with a collapsible Recent list [`3c30fa8`](https://github.com/trongnghia203/claude-code-cli-ui/commit/3c30fa8)
- Fix project chip showing the no-project style after load, wrap long folder names to 2 lines [`73587ae`](https://github.com/trongnghia203/claude-code-cli-ui/commit/73587ae)
- Fix Working Directory `..` listing the wrong folder, fix `..` and Home path filtering [`73587ae`](https://github.com/trongnghia203/claude-code-cli-ui/commit/73587ae)
- Fix stale directory responses overwriting the Working Directory list, add hover tint on `..` [`62d73c3`](https://github.com/trongnghia203/claude-code-cli-ui/commit/62d73c3)
- Open the current project when clicking CLI in the sidebar, project list when none is set [`55b46b9`](https://github.com/trongnghia203/claude-code-cli-ui/commit/55b46b9)
- Move Settings before Explore [`69be6f7`](https://github.com/trongnghia203/claude-code-cli-ui/commit/69be6f7)
- Fix icon alignment in chat and sidebar header buttons [`ce7d3ef`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ce7d3ef)

**Settings, skills, artifacts**
- Add Global / Project / Local tabs to Settings, editing `settings.json` and `settings.local.json` per project [`436f082`](https://github.com/trongnghia203/claude-code-cli-ui/commit/436f082)
- Add source filter chips to Skills - Global, Plugin, Project, GitHub, MCP [`a695a97`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a695a97)
- Add hide / unhide for projects on Project Artifacts, shared with the chat sidebar [`5a82637`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5a82637)
- Soften unpinned folders, drop the per-row orange border on pinned folders [`4714382`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4714382)

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
