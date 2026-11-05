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

- `statuses: IssueStatusDef[]`, each `{ id, name, category, color, icon, description, builtin, hidden, order }`.
- `category` is one of `unstarted`, `started`, `done`, `closed`. Logic reads the category, never the name.
- The seven built-ins keep their ids (`backlog`, `todo`, `in_progress`, `in_review`, `blocked`, `done`, `cancelled`).
  They are seeded on first read. A built-in **cannot be renamed**, deleted or given another category.
  It can be **hidden** from the workflow (see Hidden statuses), recolored and reordered.
- A custom status gets the id `st_<8 hex>`. It can be renamed, recolored, reordered, hidden, or deleted when no issue uses it.
- `issue.status` stays a string. Existing issues need no migration.
- `statusAssignees` (ADR 0013) keys by status id and works for custom statuses unchanged.

**Hidden statuses**

`hidden` replaces archive for every status, built-in or custom. A hidden status is out of the workflow:

- Not shown as a board column, in the Default chain, or in the status pickers (form, issue page, Filter, CLI help).
- Not a valid target of a move. `parseFields` refuses it with a 400.
- Issues already in it keep it and still show, with a "hidden status" tag, so no issue is orphaned. Move them out by hand.
- Its assignee rule (ADR 0013) is ignored while hidden, and kept in the file for when it is shown again.
- It stays in the Status library under a "Show hidden" toggle, with an eye icon to show it again.
- A saved view or filter that names it ignores it and shows a note.

Limits, so the workflow still works:

- `todo`, `in_progress` and `in_review` cannot be hidden: the runner needs them (next section).
- At least one visible status must stay in each of `unstarted`, `started` and `done`. `closed` may be empty.
  So `backlog` can be hidden while `todo` is visible, and `done` can be hidden once a custom `done`-category status is visible.
- Hide is refused with the reason when it would break a limit.

**Roles the runner needs**

Four built-in ids keep a fixed role, because the run lifecycle needs a known place to go:

| Role | Built-in id | Used for |
|---|---|---|
| Running | `in_progress` | a run is working |
| Delivered | `in_review` | a successful run ends here |
| Retry | `todo` | a failed or cancelled run returns here |
| Start | `todo` and `in_progress` | a user edit starts a run |

Because these three cannot be hidden, a run always has a place to start, end and retry. A custom status in the `started` category is "parked": it never starts or ends a run. Making these roles configurable is not built.

**Rules by category**

- `unstarted` and `started` count as open. `done` and `closed` count as closed. Wakeups use this (`done` or `closed` = finished).
- `backlog` never starts a run. A custom `unstarted` status behaves like `backlog` (no run).
- Board column order is `order`, grouped by category. Hidden statuses have no column.
- Filters and views store status ids. A view that names a hidden or deleted status ignores it and shows a note.

**API**

- `GET /api/issue-config` returns `statuses`.
- `POST /api/issue-config/statuses`, `PUT` and `DELETE /api/issue-config/statuses/:id`, `PUT /api/issue-config/statuses/order`.
- `parseFields` in `validate.ts` checks `status` against the configured ids instead of the constant.
  An unknown or hidden id is a 400. A hidden status still shows on issues that already have it.
- The CLI reads the list from the server. `claude-ui issue move` accepts any status id or name.

**UI**

- Workflow tab: the status library gains an **Add status** button per category, a drag handle, an eye icon to hide or show,
  and an edit dialog (name, color, icon, description) for custom statuses. Built-ins show no rename. Custom statuses can be deleted. The Default chain card lists all visible statuses in order.
- Board, Filter, Display, issue form, issue page and timeline read `useIssueConfig().statuses`, not `ISSUE_STATUS_META`.
- `ISSUE_STATUS_META` stays only as the seed for the built-ins.

## Plan

1. Server: `IssueStatusDef`, seed, read and validate in `config.ts`, routes, `parseFields`, `setStatus`. Category helper `isClosed(status)`.
2. Runner, `shouldAutoRun`, wakeups and CLI use roles and categories. Add tests by script for each.
3. Frontend: replace `ISSUE_STATUS_META` reads with config reads, board columns from `statuses`, Filter and views.
4. Workflow tab: add, edit, reorder, hide or show, delete.
5. Docs, CHANGELOG.

Steps 1 and 2 are one change. The rest can land after.

## Consequences

- A status name never decides behavior. A built-in keeps its name, so docs and the CLI stay valid. Deleting one is not allowed, hiding is.
- A custom status cannot start or end a run. If you want "QA" to hand the issue to an agent, set an assignee rule on it
  (ADR 0013). The rule sets the assignee, and you press Run, or move to `todo`.
- Saved views and shared links that hold a deleted or hidden status id ignore that filter.
- The board can grow wide. No column limit, hide a column with Display.
- Not built: several workflows, workflow per project or label, templates, configurable run roles, status transitions rules
  (which status may follow which), automatic move on PR merge.

## Open questions

- Hide limits above (runner roles locked, one visible status per open category and `done`) are a proposal. Loosen if you want to hide `in_review`.
- Is a `started` custom status with an assignee rule enough, or do you want a "run on enter" flag per status?
  The flag would reopen the run-trigger rule in ADR 0013.
