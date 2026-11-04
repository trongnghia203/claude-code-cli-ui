import { getClaudeCodeProjects } from '../../utils/claudeCodeHistory'
import { getUserProjectsAsHistory } from '../../utils/userProjects'

/** `?registered=1`: only the projects the user created. Without it: every directory Claude Code has run in. */
export default defineEventHandler(async (event) => {
  try {
    if (getQuery(event).registered) return await getUserProjectsAsHistory()
    return await getClaudeCodeProjects()
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.message || 'Failed to fetch Claude Code projects'
    })
  }
})
