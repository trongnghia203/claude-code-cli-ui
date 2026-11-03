---
description: Write the approved description to the claude-ui issue and fold the comments it covers.
argument-hint: "[ISS-n]"
allowed-tools: Bash(claude-ui issue get:*), Bash(claude-ui issue fold:*), Bash(echo $CLAUDE_UI_ISSUE)
---

Write the description drafted by `/claude-ui:issue-distill` to the issue, and fold the comments it covers.

Issue key: `$ARGUMENTS` if it has an `ISS-<n>`, else env `CLAUDE_UI_ISSUE`.
No draft in this conversation: do the steps of `/claude-ui:issue-distill`, show the draft, and stop. The user approves by running this command again.

1. Take the draft description, the `hash:` and the comment ids from the last `claude-ui issue get <KEY> --live` in this conversation.
2. Write it. Fold only the comment ids you read, so a comment added by another session stays live:

   ```
   claude-ui issue fold <KEY> --ids <id1,id2> --if-hash <hash> --note "<session label>" --body-file - <<'EOF'
   <draft description>
   EOF
   ```

   If the last `get` showed no live comments, leave out `--ids` (nothing to fold, the description is still replaced).
3. Error `The description changed since you read it`: someone else edited it. Run `claude-ui issue get <KEY> --live` again,
   merge the new text and comments into the draft, show a short diff, and ask before retrying with the new hash.
4. Done: print `folded N comment(s)`. Mention `/claude-ui:issue-comment` for a result note.
   A later update in this session needs a fresh `get` for the new `hash:`.
