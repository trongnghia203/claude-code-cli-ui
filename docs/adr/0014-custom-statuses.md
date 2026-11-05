# ADR 0014: Custom statuses

- Status: Proposed
- Date: 2026-11-05

## Context

Issues have seven fixed statuses (ADR 0001). ADR 0013 added an assignee rule per status in the Workflow tab of Issue settings,
but a user cannot add a status such as "QA" or "Waiting on customer".

The status names are hardcoded in about 15 files. Some code reads a name as a meaning:

- `runner.ts`: a run starts in `in_progress`, a success ends in `in_review`, a failure or cancel goes back to `todo`.
- `validate.ts` `shouldAutoRun`: only `todo` and `in_progress` start a run.
- `wakeups.ts`: `done` and `cancelled` count as closed when the parent waits for its sub-issues.
- `scripts/claude-ui-issue.mjs`: a fixed list, and a refusal to move an assigned issue into a status that would start a run.
- Board columns, Filter menu, Display, saved views, the issue form and the issue page.

## Decision

Statuses become data in `~/.claude/issues/_config.json` (ADR 0012). Workflows stay one and global. Several workflows are out of scope.

**Model**

- `statuses: IssueStatusDef[]`, each `{ id, name, category, color, icon, description, archived, order }`.
- `category` is one of `unstarted`, `started`, `done`, `closed`. Logic reads the category, never the name.
- The seven built-ins keep their ids (`backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`).
  They are seeded on first read. They can be recolored and reordered, not deleted, archived or given another category.
- A custom status gets the id `st_<8 hex>`. It can be renamed, recolored, reordered, archived, or deleted when no issue uses it.
- `issue.status` stays a string. Existing issues need no migration.
- `statusAssignees` (ADR 0013) keys by status id and works for custom statuses unchanged.

**Roles the runner needs**

Four built-in ids keep a fixed role, because the run lifecycle needs a known place to go:

| Role | Built-in id | Used for |
|---|---|---|
| Running | `in_progress` | a run is working |
| Delivered | `in_review` | a successful run ends here |
| Retry | `todo` | a failed or cancelled run returns here |
| Start | `todo` and `in_progress` | a user edit starts a run |

A custom status in the `started` category is "parked": it never starts or ends a run. Making these roles configurable is not built.

**Rules by category**

- `unstarted` and `started` count as open. `done` and `closed` count as closed. Wakeups use this (`done` or `closed` = finished).
- `backlog` never starts a run. A custom `unstarted` status behaves like `backlog` (no run).
- Board column order is `order`, grouped by category.
- Filters and views store status ids. A view that names an archived or deleted status ignores it and shows a note.

**API**

- `GET /api/issue-config` returns `statuses`.
- `POST /api/issue-config/statuses`, `PUT` and `DELETE /api/issue-config/statuses/:id`, `PUT /api/issue-config/statuses/order`.
- `parseFields` in `validate.ts` checks `status` against the configured ids instead of the constant.
  An unknown id is a 400. An archived status is refused for a move but still shown on issues that have it.
- The CLI reads the list from the server. `claude-ui issue move` accepts any status id or name.

**UI**

- Workflow tab: the status library gains an **Add status** button per category, a drag handle, an edit dialog
  (name, color, icon, description) and archive or delete. The Default chain card lists all non-archived statuses in order.
- Board, Filter, Display, issue form, issue page and timeline read `useIssueConfig().statuses`, not `ISSUE_STATUS_META`.
- `ISSUE_STATUS_META` stays only as the seed for the built-ins.

## Plan

1. Server: `IssueStatusDef`, seed, read and validate in `config.ts`, routes, `parseFields`, `setStatus`. Category helper `isClosed(status)`.
2. Runner, `shouldAutoRun`, wakeups and CLI use roles and categories. Add tests by script for each.
3. Frontend: replace `ISSUE_STATUS_META` reads with config reads, board columns from `statuses`, Filter and views.
4. Workflow tab: add, edit, reorder, archive, delete.
5. Docs, CHANGELOG.

Steps 1 and 2 are one change. The rest can land after.

## Consequences

- A status name never decides behavior, so renaming a built-in is safe. Deleting one is not allowed.
- A custom status cannot start or end a run. If you want "QA" to hand the issue to an agent, set an assignee rule on it
  (ADR 0013). The rule sets the assignee, and you press Run, or move to `todo`.
- Saved views and shared links that hold a deleted status id show nothing for that filter.
- The board can grow wide. No column limit, hide a column with Display.
- Not built: several workflows, workflow per project or label, templates, configurable run roles, status transitions rules
  (which status may follow which), automatic move on PR merge.

## Open questions

- Should `in_review` be renamable? Proposed yes, the id stays.
- Is a `started` custom status with an assignee rule enough, or do you want a "run on enter" flag per status?
  The flag would reopen the run-trigger rule in ADR 0013.
