# ADR 0009: `claude-ui issue fold` folds comments without a run

- Status: Accepted
- Date: 2026-11-03

## Context

ADR 0006 and 0007 fold comments through a comment command (`/distill`, `/clear`). Both run on the server, and `/distill`
needs a headless agent run. A person working in an interactive Claude Code session (planned: ADR 0008) distills the issue
themselves. That session has the context, so a second run would only cost tokens. It needs a way to say "these comments are
now in the description" without starting anything.

Two sessions can work on one issue. Both may rewrite the description, so the last write would silently win.

## Decision

- `POST /api/issues/:id/fold` and `claude-ui issue fold KEY` write the same `distill` timeline entry as `/distill`.
- Body: `commentIds` (only live ones count, default all live), `description` (replaces it, old text goes to `descriptionBefore`),
  `note` (max 200 characters), `ifDescriptionHash`.
- `GET /api/issues/:id` returns `liveCommentIds` and `descriptionHash` (sha1). `get --live` shows only live comments, with ids.
- `ifDescriptionHash` that no longer matches gives 409. The caller reads the issue again and merges.
- Fold only the ids the session read. A comment added by a parallel session stays live.
- It is refused (400) when there is nothing to fold and no new description.

## Consequences

- The CLI keeps its rule of no run, assign or delete verb. `fold` hides comments, it never deletes them. Undo is deleting the entry.
- Comment folding now has two writers: the comment commands in `comments.post.ts` and this route. The entry shape is the same.
- The hash check only protects callers that pass it. A plain `issue update` still overwrites.
