# Issues management

Track units of work and hand them to agents. Modeled on Multica issues (https://multica.ai/docs/issues).
Design decisions are in `docs/adr/0001-issues-management.md`.

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
| POST | `/api/issues/:id/comments` | Add comment. Body `{ body, run?: boolean }` |
| POST | `/api/issues/:id/run` | Start a run now |
| POST | `/api/issues/:id/cancel` | Stop the active run |

## Not built yet

Sub-issue stages, custom properties, saved views, Gantt and swimlane, batch edit, file deliverables, duplicates.
