import { updateIssue, type Issue } from './store'
import { readConfig } from './config'
import type { IssueDraft } from './draft'
import { newEntryId } from './store'

/** Write a finished draft onto an issue and clear the drafting flag. Assignee is only set when the issue has none. */
export function applyDraft(issueId: string, draft: IssueDraft, projectDir: string): Issue | null {
  return updateIssue(issueId, (i) => {
    i.title = draft.title
    i.description = draft.description
    i.priority = draft.priority
    // The draft names labels. Keep only names that exist in the workspace labels, as ids.
    const byName = new Map(readConfig(projectDir).labels.map(l => [l.name.toLowerCase(), l.id]))
    i.labels = [...new Set(draft.labels.map(n => byName.get(n.toLowerCase())).filter((x): x is string => !!x))]
    if (draft.assignee && !i.assignee) {
      i.assignee = draft.assignee
      i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'assign', from: null, to: draft.assignee })
    }
    delete i.drafting
    delete i.draftNote
  })
}
