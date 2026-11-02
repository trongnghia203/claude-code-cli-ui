# ADR 0002: Issue settings (labels, properties, wakeups)

- Status: Accepted
- Date: 2026-11-02

## Context

ADR 0001 left issue configuration out. Labels are free text typed per issue, there is no way to add fields,
and a parent issue never learns that its sub-issues finished.
Multica solves this with a settings area: Labels, Properties, Wakeups and Workflows (see https://multica.ai/docs/issues).
We want the same for this app, one piece at a time.

## Decision

Add an Issue settings page (`/issues/settings`) with three tabs: Labels, Properties, Wakeups.
Workflows (a custom status library) is deferred, see below.

### Labels

- A label is `{id, name, color, description}`. Names are unique, ignoring case.
- `Issue.labels` now holds label ids, not names. A rename or recolor needs no change on the issues.
- A label that issues still use cannot be deleted. The delete button is disabled with the count, and the API answers 409.
  Remove the label from those issues first.
- The settings table shows how many issues use each label.
- Unknown ids sent to the API are dropped, so a label deleted in another tab never stays attached.
- The agent that drafts an issue gets the label names and may only pick from them.
- Migration: when no default config exists yet, one label is created per distinct name found on existing issues,
  and those issues are rewritten to ids. It runs once, config first, so a crash half way leaves valid ids.

### Properties

- A property is `{id, name, type, options, archived}`. Types: text, number, select, date, checkbox, URL.
- Values live on the issue as `properties: {<propertyId>: value}` and are checked against the type on every write.
- The type never changes after creation, so stored values keep fitting. Select options keep their ids across renames.
- Properties are archived, never deleted. An archived property is hidden but its values stay. Limit: 20 active.
- A property that issues still have a value for cannot be archived (409). Clear the value on them first.
- Not built: multi-select, user, filtering and grouping by property, list columns.

### Wakeups

- Rule "when sub-issues finish": when a user closes a sub-issue (done or cancelled) and every sub-issue of the parent is
  now closed, the parent's agent assignee is run again with an instruction.
- The instruction is the workspace text, or a built-in one when empty. The list of sub-issues and statuses is appended.
- A setting turns the rule on or off by default. Each issue can override it with Default, On or Off.
- Only user edits can fire it. System status moves (run start, finish) never do, so it cannot loop.
- It needs an agent assignee on the parent and a parent that is not closed or already running. Otherwise nothing happens.
- Differences from Multica: no stages, so there is one wakeup when all are closed, not one per stage.
  No inbox, so a parent without an agent is not notified.

### Where settings are stored

Settings can differ per project.

- Default: `~/.claude/issues/_config.json`. Used by every project that has no file of its own.
- Project: `~/.config/claude-ui/issues/<project>/_config.json`. `<project>` is the project path with each
  non-alphanumeric character turned into `-`, the same rule as Claude Code session folders.
- A project file replaces the default as a whole. There is no merging, so a project never half follows the default.
- "Customize for this project" copies the default into the project file and keeps label and property ids,
  so existing issues keep their labels. "Reset to default" deletes the file. It is refused while an issue of that project still uses
  a label or property that exists only in the project file, so a reset never drops data in use.
- Issues are checked against the config of their own project. The settings page has a scope switch: project or default.
  A project that follows the default shows the default read-only, with a Customize button.

This puts settings outside the issues folder. ADR 0001 rejected `~/.config/claude-ui` for the issues themselves,
because issues are user content tied to `~/.claude` agents. Settings are different: they belong to the app and to one project,
the same as Schedules, which already live under `~/.config/claude-ui`. The default stays next to the issues
so a user with one project has everything in one place.

Writes use the same synchronous read-modify-write as the issue store.

### Deferred: Workflows

A custom status library needs the status list to become data. Today it is a constant used by validation, the board columns,
drag and drop, the run triggers and the run runner. That is a large change and a separate decision.
Wakeups already work with the fixed statuses, so nothing waits on it.

## Consequences

- Labels can be recolored and renamed in one place, and the board shows their colors.
- An issue stores ids, so reading its labels needs the config of its project. The UI loads the config of each project on screen.
- A label id from one project means nothing in another. Moving an issue between projects is not supported today; if it is added, labels must be mapped by name.
- Retiring a used label or property takes two steps: clear it on the issues, then delete or archive it.
- Copying the default into a project file means later default changes do not reach that project until it is reset.
- Config files sit outside `~/.claude`, so `knowledge-sync` and other `~/.claude` backups do not include per-project settings.
