import { readIssue, updateIssue } from '../../../../utils/issues/store'

/** Forget a listed session. The Claude transcript is not touched. */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')!
  const sid = String(getRouterParam(event, 'sessionId')).toLowerCase()
  if (!readIssue(id)) throw createError({ statusCode: 404, message: 'Issue not found' })
  updateIssue(id, (i) => { i.sessions = (i.sessions ?? []).filter(s => s.id !== sid) })
  return { ok: true }
})
