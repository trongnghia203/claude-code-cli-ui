# ADR 0013: Assignee per status

- Status: Accepted
- Date: 2026-11-05

## Context

An agent run ends in `in_review` (ADR 0001) and the agent stays the assignee. The status says a human must look, but the assignee
field still names the agent. Users wanted a setting that says who owns an issue in each status.

## Decision

A global setting `statusAssignees` in `~/.claude/issues/_config.json` (ADR 0012):
`{ <status>: "<agent slug>" | null }`. A missing status keeps the assignee. `null` unassigns (the user owns it).

- `setStatus()` in `server/utils/issues/store.ts` applies it, so every move goes through it: user edit, run start and finish,
  stale-run repair. The caller passes the rules.
- The change is logged as an `assign` timeline entry with `by: 'system'`.
- A user edit that sets the assignee itself skips the rule.
- A rule never starts a run. `PUT /api/issues/:id` does not auto-run when the assignee came from a rule.
- An unassigned issue can still be run: `startRun`, `POST /run` and "Comment and run" fall back to the agent of the newest run
  (`lastRunAgent` in `runner.ts`). Without this, unassigning on `in_review` would break the feedback loop.

The setting lives in the **Workflow** tab of Issue settings: a status chain card and a status library grouped by category
(Unstarted, Started, Done, Closed), one assignee dropdown per status. Statuses stay the fixed built-in seven; custom statuses and
multiple workflows are not built.

## Consequences

- No user model exists, so "human" means unassigned.
- A rule on `todo` or `in_progress` sets an agent but waits for the next user action to run it.
- Not built: per-issue override, rule by project, rule by label.
