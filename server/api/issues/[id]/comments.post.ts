import { newEntryId, readIssue, updateIssue } from '../../../utils/issues/store'
import { startRun, isRunning } from '../../../utils/issues/runner'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const { body, run, agent } = await readBody(event)
  const mention = typeof agent === 'string' && /^[\w-]+$/.test(agent) ? agent : null
  const text = String(body ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Comment is empty' })
  if (run && !issue.assignee && !mention) throw createError({ statusCode: 400, message: 'Assign an agent to run it' })
  if (run && isRunning(id)) throw createError({ statusCode: 409, message: 'A run is already active' })

  // Earlier comments, for `/last [N]`. Read before the new comment is added.
  const earlier = issue.timeline.filter(e => e.type === 'comment')
  updateIssue(id, (i) => {
    const at = new Date().toISOString()
    i.timeline.push({ id: newEntryId(), at, type: 'comment', author: 'user', body: text })
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
  if (run) startRun(id, text, undefined, null, cmd ? { question, previous } : undefined)
  return { issue: readIssue(id) }
})
