# ADR 0006: `/distill` folds comments into the description

- Status: Accepted
- Date: 2026-11-02

## Context

The description is the relay between runs (ADR 0001). A run keeps no session, so it reads the description and every comment.
Comments pile up. Many only repeat what the description should already say, or contradict it. Every later run pays for them.
We want a way to bring the description up to date and stop sending the old comments.

## Decision

A comment that starts with `/distill`, optionally after `@agent` mentions, and is sent with "Comment and run", starts a distill run.
Detected in `comments.post.ts`, like ADR 0005.

- The agent is the `@mention`, or the assignee.
- The prompt is the description, the comments no earlier distill folded, and the text after `/distill` as a hint.
- The agent compares the comments with the description and rewrites it with `claude-ui issue update`.
  The original request stays at the top. It does no other work, and does not touch status, assignee or labels.
- The run keeps the issue status, in and out. A normal run moves it to `in_progress` and then `in_review`. A distill must not.
- `/distill` with no new comments is refused (400).

### Folding

A successful run adds one timeline entry: `{ type: 'distill', foldedIds, descriptionBefore }`.

- `foldedIds` are the comments the prompt held, the `/distill` comment itself, and the run's own summary comment.
- Comments are never edited or deleted. A comment added while the run works is not in `foldedIds`, so the next run still sees it.
- `buildPrompt()` and `/last` use `liveComments()`, which skips folded comments. A prompt notes how many were skipped.
- The issue page shows a collapsed row `distill-<timestamp>  N comments folded into the description`. Click to show them.
- Undo is deleting the entry. `descriptionBefore` keeps the old description for a restore.
- A failed or cancelled run adds no entry and folds nothing.

The agent can still read folded comments with `claude-ui issue get ISS-n --comments N`.

## Consequences

- Later runs get shorter prompts. A bad rewrite hides facts from them. The folded comments and `descriptionBefore` limit the damage.
- Distill is incremental: it sees only comments since the last one.
- Not built: a "Restore description" button, and a delete verb for the entry in the CLI.
- Not built: an automatic trigger. A workflow rule on a status move (for example into `in_review`, run by `issue-watcher`,
  then hand the issue back) could post this same distill run. It was prototyped and shelved.
- The command list is in two places: the server regex and `SLASH_COMMANDS` in `app/pages/issues/[id].vue`.
