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

  // The comment right before this one, for `/last`. Read before the new comment is added.
  const prev = [...issue.timeline].reverse().find(e => e.type === 'comment')
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
  // `/last` also gets the comment before this one.
  const cmd = /^\s*(?:@[\w-]+\s+)*\/(adhoc|last)(?:\s+|$)/i.exec(text)?.[1]?.toLowerCase()
  const question = cmd ? text.replace(/\/(adhoc|last)\b/i, '').trim() : ''
  const previous = cmd === 'last' && prev?.type === 'comment' ? { author: prev.author, at: prev.at, body: prev.body } : undefined
  if (run) startRun(id, text, undefined, null, cmd ? { question, previous } : undefined)
  return { issue: readIssue(id) }
})
