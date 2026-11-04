# ADR 0010: Issues across projects, scope as tabs

- Status: Accepted
- Date: 2026-11-04

## Context

The Issues page had an "All | This project" switch next to the title and a separate tab bar of saved views.
Two controls decided what is on screen, and the default was one project. The page is meant to manage issues across projects.
A saved view with its own project filter (for example SURI) showed nothing inside "This project", because only that project's issues were loaded.

## Decision

- **Scope is a tab.** `All` and `This project` are the first two tabs of the views row. The switch beside the title is gone.
- **Default is All.** The last scope is kept in the cookie `issues-scope`. A reload or a return to the page keeps it.
  Without a selected project the page is always `All` and `This project` is disabled.
- **Last view is remembered** per scope in the cookie `issues-last-view` (`''` is the plain scope tab). A view named in the URL wins.
- **Always load every project.** `This project` trims the list in the browser to the selected project,
  unless the filters name a project. So a view with `project=suri` works in any scope.
  The Filter and Display menus offer Project in `All` and whenever a view is open.
- **Views show in both scopes.** Views stored in the default settings (saved from `All`) also show inside a project.
  A project with its own settings adds the views stored there. Each view knows its owner, so Save, Rename, Delete,
  Duplicate and Reorder write to the right file. A new view is stored in the scope where it is created.
- **Chip bar shows only the difference** to the open view. Filters the view saves are not repeated as chips.
  Clear goes back to the view's own filters, or to none without a view.
- **Tab order and hidden tabs** cover `All`, `This project` and the saved views in one list.
  They are kept in the cookies `issues-tab-order` and `issues-tab-hidden`, so they are per browser, not per project.
  Reorder by dragging a tab, or with the arrows in Manage views. The eye icon hides a tab, which still shows while it is open.
  The built-in tabs cannot be renamed, duplicated or deleted. Those icons are greyed out in Manage views.

## Consequences

- One request loads all issues, so the board grows with the total. Fine for the current size. Server paging would need a new decision.
- A view stored in `All` that uses labels or properties of one project may not match in another project. Not handled.
- Tab order and hidden tabs do not follow the user to another browser.
