# ADR 0012: Global issue settings

- Status: Accepted
- Date: 2026-11-05

## Context

ADR 0002 gave each project an optional settings file that replaced the default as a whole. Labels, properties, views and wakeups
were then per project, shared through a project picker. The Issues page works across projects (ADR 0010), so this caused problems:
the All tab read the default file and showed no custom properties that lived only in one project's file, and the same label or
property could exist several times with different ids.

## Decision

All issue settings are global, in `~/.claude/issues/_config.json`. No project scope, no share picker, no customize or reset.

- A view that should show one project uses a project filter, as the SURI view does.
- Wakeup rules are global. Each issue still overrides them in its own Wakeups row.
- API routes lose the `projectDir` query. `projects`, `project` (customize, reset) and the share routes are removed.
- `GET /api/issue-config` returns `{ config, usage }`, usage counted over all issues.

## Migration

On the first read after start, any `~/.config/claude-ui/issues/<project>/_config.json` is merged into the global file:

- Labels and properties match by id, then by name (case-insensitive). A same-name property of another type is kept and renamed `name (type)`.
- Issues and saved views that used a merged-away id are rewritten, including select option ids.
- A project view without a project filter gets one for its project, so it keeps showing the same issues. Name clashes get a number suffix.
- Wakeup rules of project files are dropped.
- Each file is renamed to `_config.json.before-global.bak`. The global file is written first, so a crash half way is repaired on the next start.

## Consequences

- One label or property list everywhere. You cannot make one that exists in a single project.
- The All tab and the project tab show the same settings.
