import { getClaudeCodeProjects, getClaudeCodeSessions, type ClaudeCodeSession } from '../../../utils/claudeCodeHistory'
import { scheduleCore } from '../../../utils/schedules/core'

interface RecentSession extends ClaudeCodeSession {
  projectName: string
  projectDisplayName: string
  projectPath: string
}

// Only the most recently active projects can hold the most recent sessions
const MAX_PROJECTS_SCANNED = 25
// Extra sessions fetched per project to make up for hidden schedule runs
const MAX_HIDDEN_HEADROOM = 200

/** Session ids created by schedule runs. They already show on the Schedules page. */
async function scheduleSessionIds(): Promise<Set<string>> {
  const ids = new Set<string>()
  try {
    const core = await scheduleCore()
    for (const job of core.readJobs()) {
      for (const run of core.listRuns(job.id, 500)) {
        if (run.sessionId) ids.add(run.sessionId)
      }
    }
  } catch {}
  return ids
}

/**
 * Most recent chats across projects (or one project), newest first.
 * Sessions started by schedule runs are left out (they live on the Schedules page).
 * Query: limit (default 8, max 100), offset (default 0), project (project name, optional).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? '8'), 10) || 8, 1), 100)
  const offset = Math.max(parseInt(String(query.offset ?? '0'), 10) || 0, 0)
  const onlyProject = typeof query.project === 'string' && query.project ? query.project : null

  try {
    const hidden = await scheduleSessionIds()
    const headroom = Math.min(hidden.size, MAX_HIDDEN_HEADROOM)
    let projects = await getClaudeCodeProjects()
    if (onlyProject) {
      projects = projects.filter(p => p.name === onlyProject)
    } else {
      projects = projects
        .filter(p => p.sessionCount > 0)
        .sort((a, b) => new Date(b.lastActivity || 0).getTime() - new Date(a.lastActivity || 0).getTime())
        .slice(0, MAX_PROJECTS_SCANNED)
    }

    const perProject = await Promise.all(
      projects.map(async (p) => {
        const { sessions } = await getClaudeCodeSessions(p.name, limit + offset + headroom, 0)
        return sessions.filter(s => !hidden.has(s.id)).map<RecentSession>(s => ({
          ...s,
          projectName: p.name,
          projectDisplayName: p.displayName,
          projectPath: p.path,
        }))
      }),
    )

    const sorted = perProject
      .flat()
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
    const sessions = sorted.slice(offset, offset + limit)

    return { sessions, hasMore: sorted.length > offset + limit }
  } catch (error: any) {
    throw createError({ statusCode: 500, message: error.message || 'Failed to load recent sessions' })
  }
})
