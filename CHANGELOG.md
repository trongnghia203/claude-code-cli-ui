# CHANGELOG

## Unreleased

**Interactive Claude Code sessions from an issue (`claude-ui session`)**
- Add `claude-ui session ISS-n [--cwd DIR] [--label L] [--resume ID] [--prompt TEXT | --prompt-file FILE | --no-prompt]`: starts `claude` with the description and live comments
- Add the `plugins/claude-ui` plugin: `/claude-ui:issue-wrap`, `issue-distill`, `issue-update`, `issue-comment` write the work back from inside the session
- Add a **Start iTerm2** button on the issue page with a folder picker, label and first message, and `POST /api/issues/:id/launch-session`
- Add a **Sessions** list on the issue page: newest first, no limit, green dot while the tab runs, **Resume** or **Open** per row
- Register each session on the issue (`POST /api/issues/:id/sessions`); resume goes through the wrapper and needs the Claude transcript
- Document it in `docs/issues-management.md` and `docs/adr/0008-interactive-issue-sessions.md`

**`claude-ui issue fold` and `get --live`**
- Add `fold`: folds live comments like `/distill` without a run, optionally replacing the description; `--if-hash` returns 409 if it changed
- Add `get --live`: only comments no distill or clear folded, with comment ids and the description hash
- Document it in `docs/issues-management.md` and `docs/adr/0009-issue-fold-verb.md`

**Comment command `/clear` hides old comments without a run**
- Add `/clear` (alias `/reset`): later runs and `/last` skip the comments, no run and no agent needed, nothing deleted
- Show it as a folded row `clear-<timestamp>` with the optional note, and a hint with the comment count while typing
- Refuse `/clear` when there are no new comments
- Document it in `docs/issues-management.md` and `docs/adr/0007-clear-command.md`

**Comment command `/distill` folds comments into the description**
- Add `/distill`: a run compares the new comments with the description and rewrites it, with no other work and no status change
- Add a distill entry on success: its comments are skipped by later runs and `/last`, and shown folded as `distill-<timestamp>`
- Keep comments and the old description, so a fold can be undone
- Refuse `/distill` when there are no new comments since the last one
- Document it in `docs/issues-management.md` and `docs/adr/0006-distill-command.md`

**Comment commands `/adhoc` and `/last` for lighter runs**
- Add `/adhoc`: a run gets only the issue id, title and the new comment, no description or history
- Add `/last` and `/last N`: same, plus the N+1 comments before yours (default 2, max 11), so a reply like `go` keeps the proposal
- Use a short hand-over for these runs: at most a few bullets under Findings, no description rewrite
- Add a `/` popup with the commands in the comment box
- Document it in `docs/issues-management.md` and `docs/adr/0005-comment-commands.md`

**Issue runs hand over through the description**
- Add a hand-over instruction to the run prompt - the agent rewrites the issue description (Context, Steps, Checklist, Findings, Next) with `claude-ui issue update`
- Keep the original request at the top; the final message is now a 2-3 line summary posted as the comment
- Document the run context and the `claude-ui issue` CLI in `docs/issues-management.md`; add a pointer in `CLAUDE.md`

**Issue filters, display and views (`/issues`)**
- Add Filter menu - status, priority, assignee, label, project (All scope), date (created, updated or any date property) and select, checkbox, text properties; AND between filters, OR inside one [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Add date rules - Today, This week, Overdue (ignores done and cancelled), Next 7 days, No date [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Add Display menu - grouping (status, priority, assignee, label, project, select property), hidden columns, ordering with direction, show sub-issues, card properties [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Group by label puts an issue with several labels in each column; drag and drop changes status only when grouped by status [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Sort issues with no value last in both directions; show closed/total progress on a parent when sub-issues are hidden [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Show active filters as removable chips under the tab bar; keep filters, display and layout in the page URL [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Add saved Views tabs with an unsaved mark, Save and Discard; Manage views to rename, move, duplicate and delete [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Store views in the issue settings file, per project or default; add `/api/issue-config/views` routes (create, update, delete, order), max 30 per config [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Add Save as view dialog - name, editable filters with Add filter, default display (layout, grouping, ordering, card properties) [`5376f5a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5376f5a)
- Add Save as view button on the filter bar; Save updates the open view when it changed [`5376f5a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5376f5a)
- Ask before giving a project its own settings when saving its first view [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Share the display controls and filter chips between the page and the dialog [`5376f5a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5376f5a)
- Add ADR 0003 - `docs/adr/0003-issue-views.md` [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)

**Timed wakeups (issue page)**
- Add Wakeups to the issue sidebar - time, agent, trigger once or repeat hourly, daily, weekdays, weekly, optional instruction, on/off switch
- Add Wakeup history with each firing and skip; fire missed wakeups after a restart and mark them late
- Wait while a run is active, skip closed issues, and skip with a note when no agent is set
- Show the next wakeup time on board cards (new card property, on by default)
- Add `/api/issues/:id/wakeups` routes and a 30-second timer plugin; the issue save keeps timed wakeups
- Add ADR 0004

**Issue cards and issue page**
- Show assignee on the first card line after the ID, and the comment count next to the priority dot [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Make card text easier to read - 14px semibold title up to 3 lines, 12px meta text, more padding [`5376f5a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5376f5a)
- Give custom properties a color (8 swatches, gray for older ones); show it on property chips as a tinted background, with the name in that color [`5376f5a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5376f5a)
- Restyle the issue page back button as a pill; going back keeps the board filters and view [`9bb6375`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9bb6375)
- Replace the browser date picker with a calendar popover (Monday first, Today and Clear)
- Make the Run agent button fit its label instead of stretching across the sidebar
- Fix an empty date property showing today's date in the sidebar - show "Set date" with a clear button [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)

**Issue settings (`/issues/settings`)**
- Add Labels tab - name, color, description, usage count; unique names [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add Properties tab - text, number, select, date, checkbox, URL; archive instead of delete, 20 active at most, type fixed after creation [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add Wakeups tab - when every sub-issue is closed, run the parent's agent with an instruction; on by default, per-issue override [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Store settings per project in `~/.config/claude-ui/issues/<project>/_config.json`, falling back to `~/.claude/issues/_config.json` [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add Customize for this project and Reset to default; a project file replaces the default as a whole [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Block deleting a label, archiving a property and resetting a project while issues still use them [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Change `Issue.labels` from names to label ids, migrated once from existing issues; the issue drafting agent may only pick existing labels [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add property fields to the new issue form and the issue sidebar [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add `/api/issue-config` routes for config, labels, properties, wakeups and per-project settings [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)
- Add ADR 0002 - `docs/adr/0002-issue-settings.md` [`290e400`](https://github.com/trongnghia203/claude-code-cli-ui/commit/290e400)

- Add macOS launcher (`scripts/`) - Swift+WKWebView app, `claude-ui` CLI, `install.sh` [`b929e24`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b929e24)

**Memory page (`/memory`)**
- Add Memory page to preview and edit `CLAUDE.md`, `AGENTS.md`, `.claude/rules/*.md`, auto-memory files; Global and Project scopes, opens on Project [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Add Preview / Edit / Diff tabs - line diff with word-level highlight, removed line before added [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Add Source Control panel under the file list - staged and changed memory files, stage / unstage / discard, commit, commit and push, push [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Limit git actions to listed memory files, never force push, confirm before pushing `main` / `master` [`7cc88cb`](https://github.com/trongnghia203/claude-code-cli-ui/commit/7cc88cb)
- Fix Improve with Claude - 22s to ~6s, plain text result, no raw JSON in the file [`d270f9b`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d270f9b)
- Show the `knowledge` folder with a list / tree view [`e7b1f46`](https://github.com/trongnghia203/claude-code-cli-ui/commit/e7b1f46)
- Open the git diff against HEAD when clicking a changed file in Source Control; diff closes after commit or discard [`def6fbe`](https://github.com/trongnghia203/claude-code-cli-ui/commit/def6fbe) [`ba025a5`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ba025a5)
- Add `GET /api/memory/git/base` returning the HEAD version of a memory file [`def6fbe`](https://github.com/trongnghia203/claude-code-cli-ui/commit/def6fbe)
- Speed up Source Control list and diff - one git call per folder, not per file [`def6fbe`](https://github.com/trongnghia203/claude-code-cli-ui/commit/def6fbe)
- Add reveal button on changed files to expand and scroll to the file in the file list [`ba025a5`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ba025a5)
- Raise contrast of small sidebar labels [`ba025a5`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ba025a5)

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
- Fix CLI session list not following a project switch from the sidebar [`b550dd0`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b550dd0)
- Fix skills, MCP servers, sidebar badges, graph and Settings tabs staying on the old project after a project switch [`50995ca`](https://github.com/trongnghia203/claude-code-cli-ui/commit/50995ca)
- Move Settings before Explore [`69be6f7`](https://github.com/trongnghia203/claude-code-cli-ui/commit/69be6f7)
- Fix icon alignment in chat and sidebar header buttons [`ce7d3ef`](https://github.com/trongnghia203/claude-code-cli-ui/commit/ce7d3ef)

**Schedules (`/schedules`)**
- Add Schedules page to run Claude unattended on a timer via launchd - weekdays, daily, weekly, hourly or every N minutes [`e331306`](https://github.com/trongnghia203/claude-code-cli-ui/commit/e331306)
- Run a prompt or one of your agents in a project folder, with per-job allowed and denied tools, budget and timeout; defaults to plan (read-only) [`e331306`](https://github.com/trongnghia203/claude-code-cli-ui/commit/e331306)
- Add two-column view like CLI - schedules and runs on the left, run output or schedule summary on the right, selection kept in the URL [`e331306`](https://github.com/trongnghia203/claude-code-cli-ui/commit/e331306)
- Add run history with status, duration, cost and a link to the chat session each run created [`e331306`](https://github.com/trongnghia203/claude-code-cli-ui/commit/e331306)
- Fix links in run output (e.g. Jira tickets) looking like plain text - style as links, keep IDs on one line, open in new tab [`514a075`](https://github.com/trongnghia203/claude-code-cli-ui/commit/514a075)
- Fix run output capped at a narrow column - use full container width [`0ba388d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/0ba388d)
- Run schedules in-process, no LaunchAgent by default [`dd9bbd1`](https://github.com/trongnghia203/claude-code-cli-ui/commit/dd9bbd1)
- Allow any budget value in the schedule editor [`b14abfa`](https://github.com/trongnghia203/claude-code-cli-ui/commit/b14abfa)
- Edit schedules inline, use full-width layout, sort tool list [`42de546`](https://github.com/trongnghia203/claude-code-cli-ui/commit/42de546)
- Fix Nitro duplicate-import and DEP0205 warnings on startup [`d060760`](https://github.com/trongnghia203/claude-code-cli-ui/commit/d060760) [`05c8c05`](https://github.com/trongnghia203/claude-code-cli-ui/commit/05c8c05)

**Agents**
- Fix New Agent wizard not scrolling on short windows, Back and Next buttons were cut off [`6719b9d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6719b9d)
- Show the CLI's real models (Opus 5.5, Sonnet 5.5, Fable 5.1, Haiku 5.5) plus Default in the agent Settings tab and wizard [`6719b9d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6719b9d)

**Dashboard**
- Add Recent chats card under Agents - this project or all, one line per chat with `[project]` tag, click opens the session [`21b8ebc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/21b8ebc)
- Add `GET /api/v2/claude-code/recent-sessions` merging the newest sessions across projects [`21b8ebc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/21b8ebc)
- Add Chats count card as the first stat [`21b8ebc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/21b8ebc)
- Make the Suggestions header collapse, remembered across visits [`21b8ebc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/21b8ebc)
- Shrink the Agents card to its content with an empty state, pin Suggestions and footer hints to the bottom, fix black row dividers [`21b8ebc`](https://github.com/trongnghia203/claude-code-cli-ui/commit/21b8ebc)
- Fix Improve with Claude saving a chat session into history [`4a4e16a`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4a4e16a)
- Show session cost on Recent chats [`9737340`](https://github.com/trongnghia203/claude-code-cli-ui/commit/9737340)

**Token Usage (`/usage`)**
- Add plan limits, skill footprint and session context panels [`a3b1216`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a3b1216)
- Add bars to skill footprint, divider in plan limits [`5470303`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5470303)
- Add top sessions to plan limits [`cc85862`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cc85862)
- Add cache hit and average cost cards, chart totals [`cb33ae6`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cb33ae6)
- Use two-column skill footprint with updated label [`2878578`](https://github.com/trongnghia203/claude-code-cli-ui/commit/2878578)
- Add cache usage and context reports; skip session persistence for them [`095af83`](https://github.com/trongnghia203/claude-code-cli-ui/commit/095af83)

**Settings, skills, artifacts**
- Add Global / Project / Local tabs to Settings, editing `settings.json` and `settings.local.json` per project [`436f082`](https://github.com/trongnghia203/claude-code-cli-ui/commit/436f082)
- Add source filter chips to Skills - Global, Plugin, Project, GitHub, MCP [`a695a97`](https://github.com/trongnghia203/claude-code-cli-ui/commit/a695a97)
- Add hide / unhide for projects on Project Artifacts, shared with the chat sidebar [`5a82637`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5a82637)
- Soften unpinned folders, drop the per-row orange border on pinned folders [`4714382`](https://github.com/trongnghia203/claude-code-cli-ui/commit/4714382)
- Fix trailing slash in settings file path [`6b754cf`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6b754cf)
- Fix project artifacts header layout [`051e31d`](https://github.com/trongnghia203/claude-code-cli-ui/commit/051e31d)
- Fix marketplace source date too small [`cf43740`](https://github.com/trongnghia203/claude-code-cli-ui/commit/cf43740)
- Make app icon transparent and full-bleed [`5efa58b`](https://github.com/trongnghia203/claude-code-cli-ui/commit/5efa58b)
- Raise `--text-tertiary` contrast in light (`#696975`) and dark (`#8a8a97`) themes - 4.5:1 or better on page background [`6763b1f`](https://github.com/trongnghia203/claude-code-cli-ui/commit/6763b1f)

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
