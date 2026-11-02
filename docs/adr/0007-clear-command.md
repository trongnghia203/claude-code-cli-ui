# ADR 0007: `/clear` hides old comments without a run

- Status: Accepted
- Date: 2026-11-02

## Context

ADR 0006 folds comments into the description with an agent run. Often the comments are only noise ("go", "ok", finished side
questions) and the description is already right. Then a run costs tokens for nothing.

## Decision

A comment that starts with `/clear` (alias `/reset`), optionally after `@agent` mentions, writes the same fold entry as `/distill`,
at once and with no run. It works with the plain "Comment" button and needs no assignee.

- The entry is `{ type: 'distill', kind: 'clear', note?, foldedIds, descriptionBefore }`. A missing `kind` means distill.
- `foldedIds` are all live comments plus the `/clear` comment. The text after the command is kept as `note` (max 200 characters).
- Later prompts and `/last` skip those comments, same as after a distill. The description is not touched.
- The page shows `clear-<timestamp>  N comments folded, description unchanged: <note>`. Click to show the comments.
- It is refused (400) when there are no live comments.
- Typing `/clear` shows a hint with the number of comments it hides, and points to `/distill`.
- Undo is deleting the entry. Nothing is deleted from the issue.

## Consequences

- A clear drops facts that only live in the comments from later runs. The hint is the only guard. `/distill` is the safe choice.
- The command list is in two places: the server regexes and `SLASH_COMMANDS` in `app/pages/issues/[id].vue`.
- `/new` was left out: it could mean a new issue, run or session.
