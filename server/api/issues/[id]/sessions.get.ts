import { readIssue } from '../../../utils/issues/store'
import { transcriptExists, transcriptTitle } from '../../../utils/issues/sessions'
import { listResumeSessionIds } from '../../../utils/iterm'
import { loadSessionNames } from '../../../utils/claudeCodeHistory'

/** The issue's interactive sessions, newest first, with `name` (Chat page rename, else the `/rename` title in the transcript), `live` (an iTerm2 tab runs it) and `transcript` (resume still works). */
export default defineEventHandler(async (event) => {
  const issue = readIssue(getRouterParam(event, 'id')!)
  if (!issue) throw createError({ statusCode: 404, message: 'Issue not found' })
  let live = new Set<string>()
  if (process.platform === 'darwin') {
    try { live = new Set(await listResumeSessionIds()) } catch { /* no live info */ }
  }
  const names = await loadSessionNames()
  const sessions = [...(issue.sessions ?? [])].reverse().map((s) => {
    const name = names[s.id]?.summary || transcriptTitle(s.id)
    return { ...s, ...(name ? { name } : {}), live: live.has(s.id), transcript: transcriptExists(s.id) }
  })
  return { sessions }
})
