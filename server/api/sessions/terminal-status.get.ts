import { listResumeSessionIds } from '../../utils/iterm'

export default defineEventHandler(async () => {
  if (process.platform !== 'darwin') return { sessionIds: [] }
  try {
    return { sessionIds: await listResumeSessionIds() }
  } catch {
    return { sessionIds: [] }
  }
})
