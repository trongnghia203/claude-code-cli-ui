import { newEntryId, readIssue, setStatus, updateIssue } from '../../utils/issues/store'
import { startRun } from '../../utils/issues/runner'
import { parseFields, shouldAutoRun } from '../../utils/issues/validate'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const before = readIssue(id)
  if (!before) throw createError({ statusCode: 404, message: 'Issue not found' })
  const f = parseFields(await readBody(event))
  if (f.parentId) {
    if (f.parentId === id) throw createError({ statusCode: 400, message: 'An issue cannot be its own parent' })
    if (!readIssue(f.parentId)) throw createError({ statusCode: 400, message: `Parent ${f.parentId} not found` })
  }
  const prev = { assignee: before.assignee, status: before.status }

  const issue = updateIssue(id, (i) => {
    const { status, assignee, ...rest } = f
    Object.assign(i, rest)
    if (assignee !== undefined && assignee !== i.assignee) {
      i.timeline.push({ id: newEntryId(), at: new Date().toISOString(), type: 'assign', from: i.assignee, to: assignee })
      i.assignee = assignee
    }
    if (status !== undefined) setStatus(i, status, 'user')
  })!
  if (shouldAutoRun(prev, issue)) startRun(id)
  return { issue: readIssue(id) }
})
