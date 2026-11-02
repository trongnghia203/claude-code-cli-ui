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

  updateIssue(id, (i) => {
    const at = new Date().toISOString()
    i.timeline.push({ id: newEntryId(), at, type: 'comment', author: 'user', body: text })
    // An @mention on a run hands the issue to that agent, so the run and the board agree on who owns it
    if (run && mention && mention !== i.assignee) {
      i.timeline.push({ id: newEntryId(), at, type: 'assign', from: i.assignee, to: mention })
      i.assignee = mention
    }
  })
  if (run) startRun(id)
  return { issue: readIssue(id) }
})
