import { newEntryId, readIssue, updateIssue } from '../../../utils/issues/store'
import { startRun, isRunning } from '../../../utils/issues/runner'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const { body, run } = await readBody(event)
  const text = String(body ?? '').trim()
  if (!text) throw createError({ statusCode: 400, message: 'Comment is empty' })
  if (run && !issue.assignee) throw createError({ statusCode: 400, message: 'Assign an agent to run it' })
  if (run && isRunning(id)) throw createError({ statusCode: 409, message: 'A run is already active' })

  updateIssue(id, (i) => {
    i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'comment', author: 'user', body: text })
  })
  if (run) startRun(id)
  return { issue: readIssue(id) }
})
