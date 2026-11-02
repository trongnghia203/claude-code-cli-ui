import { commitAgentFile, resolveAgentFile } from '../../../utils/agentGit'

export default defineEventHandler(async (event) => {
  const { message, push, workingDir } = await readBody<{ message?: string; push?: boolean; workingDir?: string }>(event)
  if (!message?.trim()) throw createError({ statusCode: 400, message: 'A commit message is required' })
  try {
    return { committed: true, ...(await commitAgentFile(resolveAgentFile(getRouterParam(event, 'slug')!, workingDir), message.trim(), !!push)) }
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }
})
