import { getClaudeCodeProjects, getClaudeCodeSessions, type ClaudeCodeSession } from '../../../utils/claudeCodeHistory'

interface RecentSession extends ClaudeCodeSession {
  projectName: string
  projectDisplayName: string
  projectPath: string
}

// Only the most recently active projects can hold the most recent sessions
const MAX_PROJECTS_SCANNED = 8

/**
 * Most recent chats across projects (or one project), newest first.
 * Query: limit (default 8, max 30), project (project name, optional).
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const limit = Math.min(Math.max(parseInt(String(query.limit ?? '8'), 10) || 8, 1), 30)
  const onlyProject = typeof query.project === 'string' && query.project ? query.project : null

  try {
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
        const { sessions } = await getClaudeCodeSessions(p.name, limit, 0)
        return sessions.map<RecentSession>(s => ({
          ...s,
          projectName: p.name,
          projectDisplayName: p.displayName,
          projectPath: p.path,
        }))
      }),
    )

    const sessions = perProject
      .flat()
      .sort((a, b) => new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime())
      .slice(0, limit)

    return { sessions }
  } catch (error: any) {
    throw createError({ statusCode: 500, message: error.message || 'Failed to load recent sessions' })
  }
})
