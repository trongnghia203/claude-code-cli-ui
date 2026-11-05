---
description: Draft this session's work into the claude-ui issue description, touching only affected parts. Preview only, writes nothing.
argument-hint: "[ISS-n] [hint]"
allowed-tools: Bash(claude-ui issue get:*), Bash(echo $CLAUDE_UI_ISSUE), Bash(echo $CLAUDE_UI_SESSION_LABEL)
---

Distill this session's work into the description of a claude-ui issue. Do not write anything.
This distills the session, not the issue. Do not audit, restructure or clean up the issue.

Issue key: the first `ISS-<n>` in `$ARGUMENTS`, else the env var `CLAUDE_UI_ISSUE` (read it with Bash `echo $CLAUDE_UI_ISSUE`).
No key: stop and ask. Any other text in `$ARGUMENTS` is a hint about what to focus on.

1. Read the current state: `claude-ui issue get <KEY> --live`. Note the printed `hash:` and the comment ids. `/claude-ui:issue-update` uses them.
   Live comments are not in the description yet. Use them only where this session's work builds on or changes what they say.
2. List what this session did: changes made, findings, decisions, dead approaches, open items. Source is this conversation only.
3. Draft the new description as the current description plus the session's changes:
   - Copy every part the session did not touch exactly as it is: the original request, other sections, text from other sessions.
     Do not rewrite text that looks stale unless the session has evidence about it.
   - Touch only the parts the session affects, among **Context**, **Steps**, **Checklist**, **Findings**, **Next**.
     Rewrite that part to current state, do not append a log. Add a section only if the session has content for it.
   - Tick `- [x]` only for work this session did and verified. Add `- [ ]` for open items the session found.
   - A dead approach this session tried goes to **Findings** with the reason. A decision goes to the right section.
   - Facts only. No secrets, tokens or kubeconfig data. No `#` headings, use `**bold**` labels.
4. Show the draft as one markdown code block, then a short list of what changed. End with: `Run /claude-ui:issue-update to write it.`

Keep the hash and the comment ids from step 1 in the conversation. Do not edit the issue.
