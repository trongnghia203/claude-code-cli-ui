import { readIssue, updateIssue } from '../../../../utils/issues/store'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const wid = getRouterParam(event, 'wid')!
  if (!readIssue(id)?.wakeups?.items?.some(w => w.id === wid)) throw createError({ statusCode: 404, message: 'Wakeup not found' })
  return { issue: updateIssue(id, (i) => { i.wakeups = { ...i.wakeups, items: i.wakeups!.items!.filter(w => w.id !== wid) } }) }
})
