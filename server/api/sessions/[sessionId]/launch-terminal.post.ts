import { existsSync, statSync } from 'node:fs'
import { launchInIterm } from '../../../utils/iterm'

const SESSION_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  const sessionId = getRouterParam(event, 'sessionId')
  const { cwd } = await readBody(event)

  if (!sessionId || !SESSION_ID_RE.test(sessionId)) {
    throw createError({ statusCode: 400, message: 'Valid session ID is required' })
  }
  if (process.platform !== 'darwin') {
    throw createError({ statusCode: 501, message: 'iTerm2 launch is only supported on macOS' })
  }
  if (!cwd || !existsSync(cwd) || !statSync(cwd).isDirectory()) {
    throw createError({ statusCode: 400, message: `Working directory does not exist: ${cwd}` })
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
