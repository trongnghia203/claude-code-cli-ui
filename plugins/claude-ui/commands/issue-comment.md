---
description: Post a short result comment on the claude-ui issue.
argument-hint: "[ISS-n] [text]"
allowed-tools: Bash(claude-ui issue comment:*), Bash(echo $CLAUDE_UI_ISSUE), Bash(echo $CLAUDE_UI_SESSION_LABEL)
---

Post one comment on the claude-ui issue.

Issue key: the first `ISS-<n>` in `$ARGUMENTS`, else env `CLAUDE_UI_ISSUE`. The rest of `$ARGUMENTS` is the comment text.
No text: write one from this session, 2-4 lines: what was done, the result, what to check or do next.

Rules for the text:
- Plain English, short sentences, one idea each. Every line at most 128 characters. No `#` headings. Hyphens, not em dashes.
- Start with `[<label>]` when env `CLAUDE_UI_SESSION_LABEL` is set, so two sessions on one issue stay apart.
- Facts only. No secrets.

Show the text, then post it:

```
claude-ui issue comment <KEY> --body-file - <<'EOF'
<text>
EOF
```

The comment stays live (not folded). The next `/claude-ui:issue-distill` folds it into the description.
