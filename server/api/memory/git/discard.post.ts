import type { MemoryScope } from '../../../utils/memoryFiles'
import { resolveRepoRequest, discardPaths } from '../../../utils/memoryGit'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, repoRoot, paths } = await readBody(event) as {
    scope?: string; projectPath?: string; repoRoot?: string; paths?: string[]
  }
  if ((scope !== 'global' && scope !== 'project') || !repoRoot || !Array.isArray(paths) || !paths.length) {
    throw createError({ statusCode: 400, message: 'scope, repoRoot and paths are required' })
  }
  try {
    const { root } = await resolveRepoRequest(scope as MemoryScope, projectPath, repoRoot, paths)
    return await discardPaths(root, paths)
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }
})
