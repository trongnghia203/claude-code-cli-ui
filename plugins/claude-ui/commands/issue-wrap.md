---
description: Wrap up the session on the claude-ui issue - distill, update the description, post a result comment.
argument-hint: "[ISS-n] [hint]"
allowed-tools: Bash(claude-ui issue get:*), Bash(claude-ui issue fold:*), Bash(claude-ui issue comment:*), Bash(echo $CLAUDE_UI_ISSUE), Bash(echo $CLAUDE_UI_SESSION_LABEL)
---

Wrap up this session on the claude-ui issue in three steps. Stop after step 1 until the user approves.

1. Do what `/claude-ui:issue-distill $ARGUMENTS` does: read the issue with `--live`, draft the new description, show it. Then ask: `Apply? (yes / edit)`.
2. On approval, do what `/claude-ui:issue-update` does (`fold` with `--ids` and `--if-hash`).
3. Do what `/claude-ui:issue-comment` does: post a 2-4 line result comment.

Finish with one line: issue key, comments folded, comment posted. The user can now exit the session.
