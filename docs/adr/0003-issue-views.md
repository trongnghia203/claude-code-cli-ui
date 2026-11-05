# ADR 0003: Issue filters, display options and saved views

- Status: Accepted
- Date: 2026-11-02

## Context

The Issues page has a board and a list, a text filter and a project scope. There is no way to narrow the issues by field,
change how cards look, group or order them, or keep a setup for next time.
Multica has three controls above the board: Filter, Display and Views (see https://multica.ai/docs/issues).
ADR 0002 added labels and custom properties, so there is now something worth filtering and grouping by.

## Decision

Add Filter, Display and Views controls to the Issues page. Build in two steps.

### Step 1: Filter and Display (no storage change)

Filtering and ordering run in the browser on the issues already loaded. The list is small and one project at a time.
The working state lives in the URL query, so a page reload or a shared link keeps it. It is not saved anywhere else.

**Filter** (a menu of fields, each with a value picker; several filters combine with AND, values inside one filter with OR):

- Status, Priority, Assignee (an agent, or "Me").
- Label (ids from the config of the project).
- Project, only when the scope is "All".
- Date: pick a date field (created, updated, or any custom date property), then Today, This week, Overdue, Next 7 days, No date.
- Property: any select, checkbox or text property from the settings.
- A "no value" choice for each, so "unassigned" and "no label" can be found.

Not built from the reference: Creator (one user) and Project status (no such thing here).

**Display:**

- Grouping: Status (default), Priority, Assignee, Label, Project, or a select property.
  An issue with several labels appears under each of them.
- Columns: show or hide each column of the chosen grouping. Empty values go in a "No <field>" column.
- Ordering: field plus direction. Fields: priority, updated, created, title, number, and each date or number property.
  Issues with no value sort last in either direction.
- Show sub-issues: when off, a sub-issue is not its own card. Its parent shows a progress count such as 2/5.
- Card properties: toggle id, priority, description, assignee, project, labels, comments, sub-issue progress,
  and each custom property. The choice is kept per browser.

Grouping by anything but status turns off drag-and-drop status changes. Dropping on another column of a different grouping
could mean "set priority" or "set assignee". That would be easy to do by accident, so it is out of scope for now.
Only the Status grouping accepts drops, as today.

### Step 2: Saved views

A view is `{id, name, layout, filters, display}`. `layout` is board or list. A tab bar above the board lists the views.
"All" is built in and cannot be edited. The menu next to the tabs has New view (save the current filters and display under a name)
and Manage views (rename, reorder, duplicate, delete). Opening a view applies it. Changing filters afterwards shows an unsaved mark,
with Save and Discard.

**Storage:** views are a `views` array inside the same settings file as labels and properties (ADR 0002):
`~/.claude/issues/_config.json`, global for every project (superseded: ADR 0012 removed per-project settings).

- A filter holds label and property ids, and those ids only mean something inside one config.
  Keeping the views in that config keeps the ids valid.
- Views therefore follow the same rule as other settings: a project uses the default views until it is customized,
  then it has its own copy. In "All" scope the default views apply.
- A filter that points at a label or property that no longer exists is ignored and shown as "removed" in the filter bar.
  The view still opens. Nothing is deleted behind the user's back.
- Deleting a label or archiving a property is already blocked while issues use it (ADR 0002).
  A view that filters on it does not count as use, so the blocks stay as they are.

Not built from the reference: pinned or shared views, per-user views (one user), Gantt, swimlanes, batch edit.

### Notes from the build

- Saving a view no longer asks about project settings: settings are global (ADR 0012).
- Search is not part of a view. It matches title, id, description and label names in the browser. Comment search would need a
  server route, because the list payload has only `commentCount`. Not built.
- "No value" sorts last in both directions, so empty due dates never crowd the top.
- Overdue ignores done and cancelled issues.
- Label ids that are not in the config of the project are ignored by filters, grouping and cards alike.
- The working state is in the URL (`f` filters, `d` display, `l` layout, `view` id). The board or list choice is also kept in a cookie.
- A view is limited to 30 per config and 8 KB of filters and display.

## Consequences

- No API change in step 1. Step 2 adds routes to create, update, reorder and delete views, next to the settings routes.
- Filtering in the browser means very large issue lists get slower. Revisit if a project passes a few thousand issues.
- Per-browser display choices (card properties) are not part of a view unless saved in one. A view carries them,
  so opening it can change how cards look. This matches the reference.
- A project that is customized does not get views added to the default later, same as labels and properties.
- Group by label shows one issue several times. Counts per column then add up to more than the issue count.
