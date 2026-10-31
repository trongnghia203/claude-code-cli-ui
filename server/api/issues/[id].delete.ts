import { deleteIssue, listIssues, updateIssue } from '../../utils/issues/store'
import { cancelRun } from '../../utils/issues/runner'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  cancelRun(id)
  if (!deleteIssue(id)) throw createError({ statusCode: 404, message: 'Issue not found' })
  // Children keep existing: just drop the dangling parent link
  for (const child of listIssues().filter(i => i.parentId === id)) updateIssue(child.id, (i) => { i.parentId = null })
  return { ok: true }
})
