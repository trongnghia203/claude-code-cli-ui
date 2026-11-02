import { listIssues, readIssue } from '../../utils/issues/store'
import { getPendingApprovals, isRunning, reapStaleRuns } from '../../utils/issues/runner'

export default defineEventHandler((event) => {
  const issue = readIssue(getRouterParam(event, 'id')!)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const subIssues = listIssues().filter(i => i.parentId === issue.id).sort((a, b) => a.number - b.number).map(({ id, title, status }) => ({ id, title, status }))
  return { issue: reapStaleRuns(issue), running: isRunning(issue.id), approvals: getPendingApprovals(issue.id), subIssues }
})
