import { existsSync, statSync } from 'node:fs'
import { readIssue, updateIssue } from '../../../utils/issues/store'
import { SESSION_ID_RE } from '../../../utils/issues/sessions'

/** `claude-ui session` registers the Claude session it starts, so the issue page can list and resume it (ADR 0008). */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  if (!readIssue(id)) throw createError({ statusCode: 404, message: 'Issue not found' })
  const { sessionId, cwd, label } = (await readBody(event)) ?? {}
  if (typeof sessionId !== 'string' || !SESSION_ID_RE.test(sessionId)) throw createError({ statusCode: 400, message: 'sessionId must be a uuid' })
  if (typeof cwd !== 'string' || !existsSync(cwd) || !statSync(cwd).isDirectory()) throw createError({ statusCode: 400, message: 'cwd must be an existing folder' })
  const name = typeof label === 'string' ? label.trim().slice(0, 40) : ''
  const sid = sessionId.toLowerCase()
  updateIssue(id, (i) => {
    i.sessions ??= []
    if (!i.sessions.some(s => s.id === sid)) i.sessions.push({ id: sid, cwd, ...(name ? { label: name } : {}), startedAt: new Date().toISOString() })
  })
  return { ok: true }
})
