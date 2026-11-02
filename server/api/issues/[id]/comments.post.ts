import { liveComments, newEntryId, readIssue, updateIssue } from '../../../utils/issues/store'
import { buildDistillPrompt, startRun, isRunning } from '../../../utils/issues/runner'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const { body, run, agent } = await readBody(event)
  const mention = typeof agent === 'string' && /^[\w-]+$/.test(agent) ? agent : null
  const text = String(body ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Comment is empty' })
  // `/clear` (or `/reset`) as first word: hide the old comments from later runs. No run, no agent needed.
  const clear = /^\s*(?:@[\w-]+\s+)*\/(?:clear|reset)(?:\s|$)/i.test(text)
  if (run && !clear && !issue.assignee && !mention) throw createError({ statusCode: 400, message: 'Assign an agent to run it' })
  if (run && !clear && isRunning(id)) throw createError({ statusCode: 409, message: 'A run is already active' })

  // `/distill` as first word (after optional @mentions): fold the comments into the description
  const distill = !!run && !clear && /^\s*(?:@[\w-]+\s+)*\/distill(?:\s|$)/i.test(text)
  // Earlier comments, for `/last [N]` and `/distill`. Read before the new comment is added.
  // Comments a distill already folded are left out: the description holds them.
  const earlier = liveComments(issue)
  if (distill && !earlier.length) throw createError({ statusCode: 400, message: 'Nothing to distill: no new comments since the last distill' })
  if (clear && !earlier.length) throw createError({ statusCode: 400, message: 'Nothing to clear: no new comments since the last distill or clear' })
  const commentId = newEntryId()
  updateIssue(id, (i) => {
    const at = new Date().toISOString()
    i.timeline.push({ id: commentId, at, type: 'comment', author: 'user', body: text })
    // An @mention on a run hands the issue to that agent, so the run and the board agree on who owns it
    if (run && mention && mention !== i.assignee) {
      i.timeline.push({ id: newEntryId(), at, type: 'assign', from: i.assignee, to: mention })
      i.assignee = mention
    }
  })
  // `/adhoc` or `/last` as first word (after optional @mentions): the run gets only this comment, not the description or history.
  // `/last N` gets N+1 comments before this one (default N=1, max 10): your own reply, like "go", is not counted against N.
  const m = /^\s*(?:@[\w-]+\s+)*\/(adhoc|last)(?:\s+(\d{1,2})(?=\s|$))?(?:\s+|$)/i.exec(text)
  const cmd = m?.[1]?.toLowerCase()
  const count = Math.min(Math.max(Number(m?.[2] ?? 1), 1), 10)
  const question = m ? text.replace(/\/(adhoc|last)(\s+\d{1,2}(?=\s|$))?/i, '').trim() : ''
  const previous = cmd === 'last'
    ? earlier.slice(-(count + 1)).flatMap(c => (c.type === 'comment' ? [{ author: c.author, at: c.at, body: c.body }] : []))
    : undefined
  if (clear) {
    const note = text.replace(/^\s*(?:@[\w-]+\s+)*/, '').replace(/^\/(?:clear|reset)/i, '').trim().slice(0, 200)
    updateIssue(id, (i) => {
      i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'distill', kind: 'clear', ...(note ? { note } : {}), foldedIds: [...earlier.map(c => c.id), commentId], descriptionBefore: i.description })
    })
  } else if (distill) {
    // What the prompt holds is what gets folded, plus the command and the run's own summary.
    // A comment added while the run works is not folded: the next run still sees it.
    const foldedIds = [...earlier.map(c => c.id), commentId]
    const descriptionBefore = issue.description
    const hint = text.replace(/^\s*(?:@[\w-]+\s+)*/, '').replace(/^\/distill/i, '').trim()
    const prompt = buildDistillPrompt(issue, earlier.map(c => ({ author: c.author, at: c.at, body: c.body })), hint)
    startRun(id, text, undefined, null, undefined, {
      prompt,
      keepStatus: true,
      after: ({ ok, commentId: summaryId }) => {
        if (!ok) return
        updateIssue(id, (i) => {
          i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'distill', foldedIds: summaryId ? [...foldedIds, summaryId] : foldedIds, descriptionBefore })
        })
      },
    })
  } else if (run) startRun(id, text, undefined, null, cmd ? { question, previous } : undefined)
  return { issue: readIssue(id) }
})
