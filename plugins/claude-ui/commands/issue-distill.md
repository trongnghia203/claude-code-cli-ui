---
description: Draft a new claude-ui issue description from this session. Preview only, writes nothing.
argument-hint: "[ISS-n] [hint]"
allowed-tools: Bash(claude-ui issue get:*), Bash(echo $CLAUDE_UI_ISSUE), Bash(echo $CLAUDE_UI_SESSION_LABEL)
---

Distill this session into a new description for a claude-ui issue. Do not write anything.

Issue key: the first `ISS-<n>` in `$ARGUMENTS`, else the env var `CLAUDE_UI_ISSUE` (read it with Bash `echo $CLAUDE_UI_ISSUE`).
No key: stop and ask. Any other text in `$ARGUMENTS` is a hint about what to focus on.

1. Read the current state: `claude-ui issue get <KEY> --live`. Note the printed `hash:` and the comment ids. `/claude-ui:issue-update` uses them.
   Comments shown there are live, so the description does not hold them yet. Fold them in too.
2. Compare the description with what this session found, decided and changed. Find what is stale, missing or contradicted.
3. Draft the new description:
   - Keep the original request at the top, unchanged.
   - Keep these sections current, rewrite stale parts, do not append a log: **Context**, **Steps**, **Checklist** (`- [x]` done, `- [ ]` open),
     **Findings**, **Next**.
   - A dead approach goes to **Findings** with the reason. A decision goes to the right section.
   - Facts only. No secrets, tokens or kubeconfig data. No `#` headings, use `**bold**` labels.
   - If env `CLAUDE_UI_SESSION_LABEL` is set, other sessions may work on this issue. Keep what they wrote.
4. Show the draft as one markdown code block, then a short list of what changed. End with: `Run /claude-ui:issue-update to write it.`

Keep the hash and the comment ids from step 1 in the conversation. Do not edit the issue.
