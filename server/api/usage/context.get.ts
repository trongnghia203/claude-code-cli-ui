import { existsSync } from 'node:fs'
import { getContextReport } from '../../utils/contextReport'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const cwd = typeof query.cwd === 'string' && existsSync(query.cwd) ? query.cwd : undefined
  try {
    const sessionId = typeof query.sessionId === 'string' && query.sessionId ? query.sessionId : undefined
    return await getContextReport(cwd, query.refresh === '1', sessionId)
  } catch (e: any) {
    throw createError({ statusCode: 500, message: e?.message || 'Failed to run claude /context' })
  }
})
