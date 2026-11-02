import { readIssue, updateIssue } from '../../../../utils/issues/store'
import { nextAfter } from '../../../../utils/issues/wakeups'
import { parseWakeup } from '../../../../utils/issues/validate'

/** Edit a wakeup or switch it on or off. Switching a spent one on needs a new time. */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const wid = getRouterParam(event, 'wid')!
  const issue = readIssue(id)
  const current = issue?.wakeups?.items?.find(w => w.id === wid)
  if (!issue || !current) throw createError({ statusCode: 404, message: 'Wakeup not found' })
  const f = parseWakeup(await readBody(event), false)
  const now = new Date()
  const updated = updateIssue(id, (i) => {
    const w = i.wakeups!.items!.find(x => x.id === wid)!
    Object.assign(w, f)
    if (f.enabled && !f.at && Date.parse(w.at) <= now.getTime()) {
      const next = nextAfter(w.at, w.repeat, now)
      if (!next) { w.enabled = false; throw createError({ statusCode: 400, message: 'This wakeup already ran. Pick a new time first.' }) }
      w.at = next
    }
  })
  return { issue: updated }
})
