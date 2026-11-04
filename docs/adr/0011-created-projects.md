# ADR 0011: Projects the user creates

- Status: Accepted
- Date: 2026-11-04

## Context

The sidebar picker only stored a raw directory. Its list was every directory Claude Code had ever run in,
including hundreds of worktree folders. There was no way to name a project or keep a short list.

## Decision

- A project is a record `{ id, name, path }` in `~/.config/claude-ui/projects.json` (override dir with `CLAUDE_UI_CONFIG_DIR`; the old `~/.claude/registered-projects.json` is copied once) (`server/utils/userProjects.ts`).
- The picker lists these records. Create, edit and remove are in the picker (`ProjectDialog.vue`, `useProjects.ts`).
  API: `/api/registered-projects` (GET, POST, PUT `[id]`, DELETE `[id]`).
- The active project is still the directory in `useWorkingDir`. Chats, schedules and issues stay keyed by that directory,
  so no existing data moves. Removing a project deletes only the record.
- Name and directory must each be unique. The directory must exist.
- On first read the file is seeded with ataccama, trongnghia203, suri, inhouse, olda and olda-utils (existing directories only).
- A directory with no project still works and shows its folder name.

## Consequences

- Projects are per machine, stored in the UI's own config dir, not in `~/.claude`.
- The old browsable "Recent" list is gone from the picker. Directories are chosen in the create dialog.

## Where the list applies

Lists of projects come from the created projects: the sidebar picker, Chat, Artifacts, Settings, the Dashboard counts and
Recent chats, the new-issue folder picker, the issue session picker, and the label and property sharing dialogs.
`GET /api/projects?registered=1` returns them with session counts. Without the query it returns every directory Claude Code has used.
That full list is for lookups by project name only, and it also holds created projects with no chat yet.
Renaming a created project in Chat renames it at the source, so every page shows the same name.
Deleting a project's history in Chat still deletes chats only, not the project.
