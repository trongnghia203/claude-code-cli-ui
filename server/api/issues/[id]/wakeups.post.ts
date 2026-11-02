import { newEntryId, readIssue, updateIssue } from '../../../utils/issues/store'
import { parseWakeup } from '../../../utils/issues/validate'

const MAX_WAKEUPS = 20

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const issue = readIssue(id)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  if ((issue.wakeups?.items?.length ?? 0) >= MAX_WAKEUPS) throw createError({ statusCode: 400, message: `Limit is ${MAX_WAKEUPS} wakeups per issue` })
  const f = parseWakeup(await readBody(event), true)
  const updated = updateIssue(id, (i) => {
    const item = { id: newEntryId(), at: f.at!, agent: f.agent ?? null, instruction: f.instruction ?? '', repeat: f.repeat!, enabled: true, createdAt: new Date().toISOString() }
    i.wakeups = { ...i.wakeups, items: [...(i.wakeups?.items ?? []), item] }
  })
  return { issue: updated }
})
