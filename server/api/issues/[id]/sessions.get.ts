import { readIssue } from '../../../utils/issues/store'
import { transcriptExists } from '../../../utils/issues/sessions'
import { listResumeSessionIds } from '../../../utils/iterm'

/** The issue's interactive sessions, newest first, with `live` (an iTerm2 tab runs it) and `transcript` (resume still works). */
export default defineEventHandler(async (event) => {
  const issue = readIssue(getRouterParam(event, 'id')!)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  let live = new Set<string>()
  if (process.platform === 'darwin') {
    try { live = new Set(await listResumeSessionIds()) } catch { /* no live info */ }
  }
  const sessions = [...(issue.sessions ?? [])].reverse().map(s => ({ ...s, live: live.has(s.id), transcript: transcriptExists(s.id) }))
  return { sessions }
})
