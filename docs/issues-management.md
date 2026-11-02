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

## Run settings

Per issue: permission mode (`plan`, `default`, `acceptEdits`). Default `acceptEdits`.
Use `plan` for investigation issues where the agent should not edit files.
Fixed: budget $5, timeout 30 minutes.

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
