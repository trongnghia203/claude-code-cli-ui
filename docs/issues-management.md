# Issues management

Track units of work and hand them to agents. Modeled on Multica issues (https://multica.ai/docs/issues).
Design decisions are in `docs/adr/0001-issues-management.md`. Settings are in `docs/adr/0002-issue-settings.md`.

## Concepts

- **Issue**: a feature, bug or investigation. Key `ISS-<n>`. Has title, description (markdown), status, priority,
  assignee, labels, optional parent, project directory.
- **Run**: one execution of an agent on an issue. An issue can have many. A finished run does not mean the issue is done.
- **Timeline**: comments, status changes, assignments and runs, in time order.

## Statuses

| Status | Category | Meaning |
|---|---|---|
| `backlog` | unstarted | Parked. Never starts a run |
| `todo` | unstarted | Ready for the assignee |
| `in_progress` | started | A run is working on it |
| `in_review` | started | Agent delivered. Human reviews |
| `blocked` | started | Waiting on something |
| `done` | done | Finished |
| `cancelled` | closed | Stopped. Record is kept |

## Create with agent

The New issue dialog opens in **Create with agent** mode. Type one line, press Create (or Cmd+Enter), and an agent files the issue.

1. A small model (`haiku`, no tools, plan mode) reads your line plus the list of your agents.
2. It returns a title, a markdown description, a priority, optional labels and an assignee.
   It only adds what you wrote. Name an agent in the line ("let code-reviewer look at...") to assign it.
3. The issue is created as `todo`. If an agent was assigned, it starts working at once, same as manual create.
4. If drafting fails, you get an error and your text stays. **Switch to Manual** keeps it as the title.

**Create another** keeps the dialog open with a fresh form. The last used mode is remembered.

## Assigning to an agent

1. Pick an agent in the assignee field. Agents come from `~/.claude/agents`.
2. If the status is `todo` or `in_progress`, a run starts at once. In `backlog` nothing runs.
3. The agent runs in the issue's project directory with the issue text and comments as its prompt.
4. On success the issue moves to `in_review`. On failure or timeout it goes back to `todo` and the error is in the timeline.
5. Add a comment and press "Comment and run" to send feedback and run again.

Assigning no agent means you own it. No run is created.

### Context a run receives

A run keeps no session (`--no-session-persistence`). The prompt is built by `buildPrompt()` in `server/utils/issues/runner.ts`:
title, description, all comments, the wakeup text if any, then the hand-over instruction.
"Run agent" and "Comment and run" use the same prompt. Your comment is already in the timeline, so it appears under Discussion.

**Adhoc run.** Start a comment with `/adhoc` (an `@agent` mention may come first) and press "Comment and run".
The prompt is then only the issue id, title and that comment. No description, no earlier comments.
The agent can read more with `claude-ui issue get`. It does not rewrite the description, it adds at most 1-3 bullets under **Findings**.
Example: `@ops-engineer /adhoc check Snowflake for Petronas, which cluster is it`.
`/last` works the same but also sends the 2 comments before yours (for example the agent's proposal and your `go`).
`/last N` sends N+1 comments before yours (N max 10, yours and the agent's, oldest first).
The +1 is there because a short reply of yours, like `go`, would otherwise use up the count.

**Distill.** Start a comment with `/distill` (an `@agent` mention may come first) and press "Comment and run".
The agent gets the description and the comments no earlier distill folded, plus any text after `/distill` as a hint.
It rewrites the description to match them, keeps your original request at the top, and does nothing else. The status does not change.
On success the comments it saw are folded: later runs and `/last` skip them, and the page shows them under `distill-<timestamp>`.
Nothing is deleted. Example: `@issue-watcher /distill focus on the rollback decision`.
With no new comments since the last distill, the command is refused.

**Redraft.** Start a comment with `/redraft` (an `@agent` mention may come first) and press "Comment". No run starts.
The agent gets the whole issue: title, description, comments and the hint. It opens every link in them read-only
(bare ticket keys do not count, paste the full URL) and rewrites the title, description, priority and labels.
The `@agent` is the one that reads them. Text after `/redraft` is a hint.
With no links it redrafts from the text alone. It is refused while a draft is running.
On failure the text stays as it was and a note shows why.

**Clear.** Start a comment with `/clear` (or `/reset`) and press "Comment". No run starts and no agent is needed.
The comments so far are folded like after a distill, but the description is not touched. Text after `/clear` is kept as a note on the folded row.
Use it for noise. Use `/distill` when the comments hold facts the description should keep.

**The description is the relay between runs.** Before finishing, the agent reads the issue with `claude-ui issue get` and rewrites
the description with `claude-ui issue update`. It keeps your original request at the top, then Context, Steps, Checklist, Findings, Next.
Long detail goes to the project notes file (for a Jira ticket: its impl-notes). The agent's final message is only a 2-3 line summary,
posted as the comment.
The agent needs `Bash(claude-ui issue *)` allowed in `~/.claude/settings.json`, or it asks for approval on the issue page.
You can edit the description between runs. The next run reads your edit.

## Run settings

Per issue: permission mode (`plan`, `default`, `acceptEdits`). Default `acceptEdits`.
Use `plan` for investigation issues where the agent should not edit files.
Fixed: budget $5, timeout 30 minutes.

## CLI: `claude-ui issue`

Agent-safe way to read and write issues from a terminal or from a run. Source: `scripts/claude-ui-issue.mjs`, dispatched by `scripts/claude-ui`.
It talks to the local server (`CLAUDE_UI_URL`, or `CLAUDE_UI_PORT`, default 3030). Start it first: `claude-ui start --no-open`.

```bash
claude-ui issue list    [--status S] [--label L] [--limit N] [--json]
claude-ui issue get     ISS-1 [--comments N] [--live] [--json]
claude-ui issue create  --title T [--body TEXT | --body-file FILE|-] [--status S] [--priority P] [--label a,b] [--project DIR] [--parent ISS-1]
claude-ui issue update  ISS-1 [--title T] [--body TEXT | --body-file FILE|-] [--priority P] [--label a,b] [--add-label L] [--remove-label L]
claude-ui issue move    ISS-1 STATUS
claude-ui issue comment ISS-1 [--body TEXT | --body-file FILE|-]
claude-ui issue fold    ISS-1 [--ids a,b] [--note T] [--body TEXT | --body-file FILE|-] [--if-hash H]
```

- `--body-file -` reads stdin. `update --body` replaces the whole description.
- `create` makes an unassigned issue in `plan` mode, default project is the current directory or `CLAUDE_UI_PROJECT`.
- There is no run, cancel, assign or delete verb on purpose. An agent can't start runs or hand work to another agent.
- `move` to `todo` or `in_progress` is refused on an assigned issue, because that status starts a run.
- `get --live` shows only comments no distill or clear folded, with ids and the description hash.
- `fold` folds live comments like `/distill`, with no run. `--body` also replaces the description. `--if-hash` refuses with 409 if the description changed since `get` printed that hash.
- To let runs use it without a prompt, allow `Bash(claude-ui issue *)` in `~/.claude/settings.json`.

## Views

- **Board**: one column per status. Change status with the card menu or on the detail page.
- **List**: grouped by status, sortable by priority and updated time.
- Scope toggle: current project or all issues.

## Storage

`CLAUDE_DIR/issues/ISS-<n>.json` and `CLAUDE_DIR/issues/_counter.json`. Plain JSON, safe to inspect or back up.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/issues` | List (no timelines). Query: `workingDir`, `all` |
| POST | `/api/issues` | Create |
| GET | `/api/issues/:id` | Detail with timeline |
| PUT | `/api/issues/:id` | Update fields. May start a run |
| DELETE | `/api/issues/:id` | Delete. Cancels an active run |
| POST | `/api/issues/agent-create` | One-line request in, filed issue out. Body `{ prompt, projectDir, agents }` |
| POST | `/api/issues/:id/comments` | Add comment. Body `{ body, run?: boolean }` |
| POST | `/api/issues/:id/run` | Start a run now |
| POST | `/api/issues/:id/cancel` | Stop the active run |

## Not built yet

Sub-issue stages, custom properties, saved views, Gantt and swimlane, batch edit, file deliverables, duplicates.

## Settings

Open the gear icon on the Issues page (`/issues/settings`). Tabs: Labels, Properties, Wakeups.

- **Scope**: the default settings, or one project's own. A project follows the default until you press
  **Customize for this project**. Then it has its own labels, properties and wakeups, copied from the default.
  **Reset to default** removes them, and is blocked while issues use labels or properties only the project has.
- **Labels**: name, color, description. The table shows how many issues use each. A label in use cannot be deleted.
- **Properties**: custom fields (text, number, select, date, checkbox, URL). Archive instead of delete, only when no issue has a value. 20 active at most.
- **Wakeups**: when every sub-issue is closed, the parent's agent runs again with an instruction. Turn it on or off for all
  issues, or per issue in its Wakeups row.

Files: default `~/.claude/issues/_config.json`, project `~/.config/claude-ui/issues/<project>/_config.json`.

## Filter, Display and Views

Above the board: **Filter**, **Display**, board or list, and a tab bar of saved views. Design in `docs/adr/0003-issue-views.md`.

- **Filter**: Status, Priority, Assignee, Label, Project (in "All" scope), Date and your select, checkbox and text properties.
  Several filters combine with AND, values inside one filter with OR. Date rules: Today, This week, Overdue, Next 7 days, No date,
  on created, updated or any date property. Active filters show as chips under the tab bar.
- **Display**: grouping (status, priority, assignee, label, project or a select property), hidden columns, ordering with direction,
  show or hide sub-issues (the parent then shows closed/total), and which properties each card shows.
  Drag and drop changes status only when grouped by status. Grouped by label, an issue with two labels appears twice.
- **Views**: **All** is built in. The layers button next to the tabs has New view and Manage views (rename, move, duplicate, delete).
  Changing filters on an open view shows `*` with Save and Discard.
  Views live in the settings file of the project, or the default one, so they follow the same Customize and Reset rules.
- The current filters and display are in the page URL, so a reload or a shared link keeps them.

## Timed wakeups

Each issue can wake an agent at a set time. Design in `docs/adr/0004-issue-wakeups.md`.

- In the issue sidebar, **Wakeups** has a + button. A wakeup has a date and time, an agent (default: the assignee),
  Trigger once, hourly, daily, weekdays or weekly, and an optional instruction. Use the switch to turn one off.
- **Wakeup history** lists each firing and each skip, with a note.
- It only fires while the app is running. After a restart, a missed one fires at once and is marked late.
- If a run is active on the issue, the wakeup waits. A closed issue skips it. The board card can show the next wakeup time.

## Interactive session: `claude-ui iterm2`

For long jobs that need you in the loop. Design in `docs/adr/0008-interactive-issue-sessions.md`.

- `claude-ui iterm2 ISS-12` starts `claude` in the issue's project with the description and live comments (not folded ones).
- `--cwd DIR` starts it elsewhere. `--label inhouse` names the session. Run two for two repos, each with its own label.
- On the issue page, **Start iTerm2** (sidebar) opens a panel: pick the folder, optionally name the session, press Start.
  It opens a new iTerm2 tab running this command. macOS and iTerm2 only.
- The first message asks for a short summary of what is open. `--prompt TEXT` or `--prompt-file FILE` replaces it, `--no-prompt` skips it.
  In the panel it is a multi-line field. Empty uses the default shown as the placeholder.
- Every session is listed under **Sessions** in the sidebar, newest first, with no limit. **Open** focuses the iTerm2 tab if it is
  still running, or reopens the session in a new tab, with fresh issue context. CLI: `--resume ID`. Resume works while Claude Code still has the transcript.
  - One line per row: the session name, then the time at the right. The name is the Chat page rename, else the `/rename` title
    from the transcript. With no name the row shows the folder, shortened to 25 characters (`~/ataccama/../dir`).
  - The tooltip shows the label and the full folder path. Names refresh with the list (every 15 seconds).
  - Rows are never removed. If the transcript is deleted on the Chat page, the row stays and Resume is disabled.
- `--dry-run` writes the context file and prints the command without starting it.
- Inside, `/claude-ui:issue-wrap` drafts a new description, asks, writes it, folds the comments it covered and posts a result comment.
  The parts are `/claude-ui:issue-distill` (preview only), `/claude-ui:issue-update` and `/claude-ui:issue-comment`.
- If another session or you changed the description meanwhile, the update stops, reads again, merges and asks before retrying.
- Without a wrap, nothing is written. On exit the CLI says so.
