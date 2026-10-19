import { existsSync, statSync } from 'node:fs'
import { launchInIterm } from '../../../utils/iterm'

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  const body = await readBody(event)
  const isDir = (p: unknown) => typeof p === 'string' && existsSync(p) && statSync(p).isDirectory()
  // Session cwd goes stale when a project is moved; fall back to the project's resolved path
  const cwd = isDir(body.cwd) ? body.cwd : body.projectPath

  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    throw createError({ statusCode: 400, message: 'Valid session ID is required' })
  }
  if (process.platform !== 'darwin') {
    throw createError({ statusCode: 501, message: 'iTerm2 launch is only supported on macOS' })
  }
  if (!isDir(cwd)) {
    throw createError({ statusCode: 400, message: `Working directory does not exist: ${body.cwd}` })
  }

  try {
    const result = await launchInIterm(sessionId, cwd)
    return { success: true, result }
  } catch (error: any) {
    throw createError({
      statusCode: 500,
      message: error.stderr?.trim() || error.message || 'Failed to launch iTerm2',
    })
  }
})
