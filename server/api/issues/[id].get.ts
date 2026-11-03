import { createHash } from 'node:crypto'
import { listIssues, liveComments, readIssue } from '../../utils/issues/store'
import { getPendingApprovals, isRunning, reapStaleRuns } from '../../utils/issues/runner'

export default defineEventHandler((event) => {
  const issue = readIssue(getRouterParam(event, 'id')!)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  const subIssues = listIssues().filter(i => i.parentId === issue.id).sort((a, b) => a.number - b.number).map(({ id, title, status }) => ({ id, title, status }))
  const liveCommentIds = liveComments(issue).map(c => c.id)
  const descriptionHash = createHash('sha1').update(issue.description ?? '').digest('hex')
  return { issue: reapStaleRuns(issue), liveCommentIds, descriptionHash, running: isRunning(issue.id), approvals: getPendingApprovals(issue.id), subIssues }
})
