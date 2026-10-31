import { readIssue } from '../../../utils/issues/store'
import { startRun } from '../../../utils/issues/runner'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  if (!issue.assignee) throw createError({ statusCode: 400, message: 'Assign an agent first' })
  if (issue.status === 'cancelled' || issue.status === 'done') throw createError({ statusCode: 400, message: `Issue is ${issue.status}. Reopen it first` })
  const runId = startRun(id)
  if (!runId) throw createError({ statusCode: 409, message: 'A run is already active' })
  return { runId }
})
