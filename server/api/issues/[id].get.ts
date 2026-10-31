import { readIssue } from '../../utils/issues/store'
import { isRunning, reapStaleRuns } from '../../utils/issues/runner'

export default defineEventHandler((event) => {
  const issue = readIssue(getRouterParam(event, 'id')!)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  return { issue: reapStaleRuns(issue), running: isRunning(issue.id) }
})
