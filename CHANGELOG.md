# CHANGELOG

## Unreleased

## 2026-10-09

**Project awareness**
- Add project-local skills loading from `<workingDir>/.claude/skills/` with green `project` badge in Skills list [`f6385ce`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f6385ce)
- Add `GET /api/project/info` reading project `CLAUDE.md`, `AGENTS.md`, `.claude/settings.json`, `.claude/settings.local.json` [`f6385ce`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f6385ce)
- Add project config card on Dashboard surfacing which project files exist when working dir is set [`f6385ce`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f6385ce)

**Logs page (`/logs`)**
- Add Logs page with SSE tail of `~/.claude/daemon.log` - filters, search, pause/resume, auto-scroll [`cbe986a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cbe986a)
- Add log source switcher (Claude Daemon vs UI dev server) [`cbe986a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cbe986a)
- Add Logs nav link to sidebar [`cbe986a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cbe986a)

**Token Usage dashboard (`/usage`)**
- Add token usage dashboard with stat cards, timeline chart, cost breakdown donut, top projects table, model performance table [`c6f97fc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c6f97fc)
- Add Usage nav link to sidebar [`c6f97fc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c6f97fc)
- Fix sort tables by cost descending [`c6f97fc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/c6f97fc)

**Working directory popover**
- Add `..` parent navigation entry to suggestions list [`1a308a0`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1a308a0)
- Add Home button inline with title row [`1a308a0`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1a308a0)
- Increase suggestions box height to 420px, sort folders alphabetically, raise limit to 20 [`1a308a0`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1a308a0)
- Remove icon before `..` entry [`1a308a0`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1a308a0)

**CLI project folder sidebar**
- Add pin/hide for project folders [`f0cab66`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f0cab66)
- Add sort option (recent / name / sessions) [`f0cab66`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f0cab66)
- Add accent background for pinned folders [`f0cab66`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f0cab66)
- Add compact view toggle [`f0cab66`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f0cab66)
- Fix compact mode layout - single line, row height, collapse button width [`f0cab66`](https://github.com/trongnghia203/claude-code-cli-ui/commit/f0cab66)

**Typography - font sizes**
- Bump sidebar nav: `13px` → `14px`, row padding `py-[7px]` → `py-[5px]` [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)
- Bump Skills list: name `13px` → `14px`, description `12px` → `13px`, padding `py-2.5` → `py-1.5` [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)
- Bump Agents, Commands, Plugins list rows: name `13px` → `14px`, description `12px` → `13px` [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)
- Bump Plugins row padding `py-2.5` → `py-1.5` [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)

**Typography - contrast & fonts**
- Replace Clash Display with Geist Sans as `--font-display` [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)
- Remove `font-display` from MCP server name chips and sidebar brand text [`24be193`](https://github.com/trongnghia203/claude-code-cli-ui/commit/24be193)
- Bump sidebar inactive nav items `text-tertiary` → `text-secondary` [`52b9606`](https://github.com/trongnghia203/claude-code-cli-ui/commit/52b9606)
- Bump sidebar bottom items (Search, Claude, Light mode, Set project directory) to `text-secondary` [`52b9606`](https://github.com/trongnghia203/claude-code-cli-ui/commit/52b9606)
- Bump `CLAUDE CODE` subtitle `text-disabled` → `text-tertiary` [`52b9606`](https://github.com/trongnghia203/claude-code-cli-ui/commit/52b9606)
- Bump `.claude` path footer `9px` → `10px`, `text-disabled` → `text-tertiary` [`52b9606`](https://github.com/trongnghia203/claude-code-cli-ui/commit/52b9606)

**MCP servers**
- Add capability discovery and support for modern HTTP transport [`4d29329`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4d29329)
- Fix MCP permission display [`4d29329`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4d29329)
- Fix stdio transport load capabilities [`4d29329`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4d29329)

**Chat interface**
- Add git panel and file explorer sidebar [`9314402`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9314402)
- Add AskUserQuestion UI with permission answer flow [`eb07ef1`](https://github.com/trongnghia203/claude-code-cli-ui/commit/eb07ef1)
- Fix live session sync and active indicator [`d3cb533`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d3cb533)
- Fix chat message deduplication [`0dcae9d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/0dcae9d)

**Agents / Skills / Project Artifacts**
- Add clickable agents/skills in project artifacts and project modal [`1feb9ca`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1feb9ca)
- Add file location display in Skill and Agent detail pages [`443522c`](https://github.com/trongnghia203/claude-code-cli-ui/commit/443522c)
- Fix skill loading from non-standard project artifact paths [`1c0d1d6`](https://github.com/trongnghia203/claude-code-cli-ui/commit/1c0d1d6)

**Misc**
- Standardize dev server port to 3030 [`0dcae9d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/0dcae9d)
- Add CI setup [`eb07ef1`](https://github.com/trongnghia203/claude-code-cli-ui/commit/eb07ef1)
