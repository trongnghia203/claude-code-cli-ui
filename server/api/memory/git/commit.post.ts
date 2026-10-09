import type { MemoryScope } from '../../../utils/memoryFiles'
import { resolveRepoRequest, commitPaths, pushRepo } from '../../../utils/memoryGit'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, repoRoot, paths, message, push } = await readBody(event) as {
    scope?: string; projectPath?: string; repoRoot?: string; paths?: string[]; message?: string; push?: boolean
  }
  if ((scope !== 'global' && scope !== 'project') || !repoRoot || !Array.isArray(paths) || !paths.length || !message?.trim()) {
    throw createError({ statusCode: 400, message: 'scope, repoRoot, paths and message are required' })
  }

  let root: string
  try {
    ;({ root } = await resolveRepoRequest(scope as MemoryScope, projectPath, repoRoot, paths))
    await commitPaths(root, paths, message.trim())
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }

  if (!push) return { committed: true, pushed: false }
  // The commit succeeded either way; report a push failure without losing that
  try {
    await pushRepo(root)
    return { committed: true, pushed: true }
  } catch (e: any) {
    return { committed: true, pushed: false, pushError: e.message }
  }
})
