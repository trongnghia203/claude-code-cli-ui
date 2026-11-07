---
description: Wrap up the session on the claude-ui issue - write the session's work into the description, post a result comment.
argument-hint: "[ISS-n] [hint]"
allowed-tools: Bash(claude-ui issue get:*), Bash(claude-ui issue fold:*), Bash(claude-ui issue comment:*), Bash(echo $CLAUDE_UI_ISSUE), Bash(echo $CLAUDE_UI_SESSION_LABEL)
---

Wrap up this session on the claude-ui issue in three steps. This records the session's work. It does not distill or clean up the issue.
Running this command is the approval. Do not stop to ask between steps.

1. Do what `/claude-ui:issue-distill $ARGUMENTS` does: read the issue with `--live`, draft the new description, show it.
   Do not ask `Apply?`. Go straight to step 2.
2. Do what `/claude-ui:issue-update` does (`fold` with `--ids` and `--if-hash`).
   On `The description changed since you read it`: stop, show the merge diff and ask before retrying. This is the only stop.
3. Do what `/claude-ui:issue-comment` does: post a 2-4 line result comment.

Finish with one line: issue key, comments folded, comment posted. The user can now exit the session.
