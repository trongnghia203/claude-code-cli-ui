# ADR 0001: Issues management modeled on Multica

- Status: Accepted
- Date: 2026-10-31

## Context

agents-ui manages agents, schedules and sessions, but has no place to track a unit of work across several agent runs.
Multica (https://github.com/multica-ai/multica, docs: https://multica.ai/docs/issues) solves this with issues:
an issue is the lasting record, an agent run is one execution of it, and the issue status says whether the work is done.

We want the same loop in this app: create an issue, assign it to one of the agents in `~/.claude/agents`,
watch the run, review the result, comment, run again.

## Decision

Add an Issues section. Copy the Multica concepts that fit a single-user local tool. Drop the multi-user ones.

### Kept from Multica

- Issue key `ISS-<n>` from a counter.
- Seven statuses in four categories: `backlog`, `todo` (unstarted), `in_progress`, `in_review`, `blocked` (started),
  `done`, `cancelled`.
- Priority: `none`, `low`, `medium`, `high`, `urgent`.
- Assignee is an agent slug, or empty. Assigning an agent starts a run, except in `backlog`.
- One timeline per issue: comments, status changes, assignments and runs.
- Run is separate from issue. A finished run does not close the issue.
- Failed run with no retry moves `in_progress` back to `todo`.
- Agent delivery moves `in_progress` to `in_review`. A human decides `done`.
- Parent issue link and labels.
- Board and list views.

### Dropped or deferred

- Members and squads: solo tool, no members.
- Custom statuses and properties, saved views, Gantt, swimlane, batch edit, stages, deliverables, duplicates.
- Daemon and runtime registry: the app server spawns `claude` itself, like Schedules.
- Autopilot: Schedules already covers timed runs.

### Storage

No database, same as the rest of the app. One JSON file per issue under `CLAUDE_DIR/issues/<KEY>.json`,
plus `CLAUDE_DIR/issues/_counter.json` for the next number.
The file holds the whole timeline and run records, so one read gives the detail page.
All writes go through `server/utils/issues/store.ts` using synchronous read-modify-write.
Node is single threaded, so a sync update cannot interleave with another one.

Alternative considered: store under `~/.config/claude-ui` like Schedules.
Rejected: issues are user content tied to `~/.claude` agents, and `CLAUDE_DIR` already moves with the user's config.

### Runs

`server/utils/issues/runner.ts` spawns `claude -p --output-format json --agent <slug>` in the issue's project directory.
The prompt is sent on stdin and holds the key, title, description and the comment thread.
This mirrors `scripts/schedule-core.mjs` (same args, same JSON result parsing, same timeout).
It is a separate runner because an issue run must write back into the issue, and the schedule runner is a standalone
script that also runs under launchd.

Runs live in the app server process. A running child is tracked in memory so it can be cancelled.
If the server restarts mid-run, the next read marks stale `running` records as `error` ("server restarted").

Permission mode is per issue, default `acceptEdits`. Allowed modes: `plan`, `default`, `acceptEdits`.
Budget and timeout have fixed defaults ($5, 30 minutes).

### Run triggers

A run starts when a user edit leaves the issue with an agent assignee and status `todo` or `in_progress`,
and the edit changed the assignee or the status, and no run is active.
System status changes (run start, finish) never trigger a run, so there is no loop.
A manual Run button and "comment and run" cover re-runs.

### Create with agent

Like Multica's "Create with agent": one line in, issue out. `POST /api/issues/agent-create` runs `claude -p` once with the
`haiku` alias, plan mode and a prompt that forbids tools, and asks for a JSON object.
The reply is parsed leniently and normalized: unknown assignees, priorities and empty titles fall back to safe defaults.
The user text is wrapped as data in the prompt, and the agent may not invent requirements.
The call is synchronous (a few seconds) with a spinner in the dialog. On failure nothing is created and the text is kept.
The client sends its agent list, so the server does not rescan `~/.claude/agents`.

### Scope

An issue has a `projectDir`, the working directory the agent runs in. The UI lists issues for the selected project,
with an "All" option, the same idea as the Schedules and Memory scope toggle.

## Consequences

- Fits the existing no-database model and reuses agents, sessions and the `claude` spawn pattern.
- Each run records `sessionId`, so the timeline links to the full chat in the CLI sessions view.
- Issues only progress while the app server is running.
- Concurrent edits from two browser tabs resolve as last write wins per field, since updates patch fields.
- Without a daemon, remote runtimes are out of scope.
