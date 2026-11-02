# ADR 0005: Comment commands for lighter runs

- Status: Accepted
- Date: 2026-11-02

## Context

A run keeps no session. Its prompt holds the title, the whole description and every comment (ADR 0001, `buildPrompt()`).
On a long issue that is a lot of tokens for a small side question, such as "check Snowflake for this customer".
A short reply like `go` has the opposite problem: it needs the agent's last proposal, but not the rest.

## Decision

A comment that starts with a slash command, optionally after `@agent` mentions, changes what the run receives.
The command is detected on the server in `comments.post.ts`. It only applies to "Comment and run".

- `/adhoc`: prompt is the issue id, title and the new comment. No description, no earlier comments.
- `/last`: like `/adhoc`, plus the 2 comments before the new one.
- `/last N`: plus N+1 earlier comments (N max 10), oldest first.

The +1 is on purpose. People read N as "agent comments", but a short reply of their own, like `go`, would use up the count.

The agent can always read more with `claude-ui issue get`. Both commands use a shorter hand-over: no rewrite of the description,
at most 1-3 bullets under **Findings**. A side question must not rewrite the main context.

The comment box shows a popup for `/` as the first word. The command list is `SLASH_COMMANDS` in `app/pages/issues/[id].vue`.

## Consequences

- Cheap focused runs. The cost is that the agent may miss context that sits in the description or older comments.
- The main description stays accurate across side runs, but findings of an adhoc run can be thin.
- The command names are a second, hidden syntax on top of the comment text. The popup is the only hint.
- Commands live in two places, the server regex and the UI list. A new command must be added to both.
- Skill commands (`/upgrade-paas-v2`) are not part of this decision. They need a skill list and the `Skill` tool on the agent.
