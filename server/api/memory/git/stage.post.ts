import type { MemoryScope } from '../../../utils/memoryFiles'
import { resolveRepoRequest, stagePaths } from '../../../utils/memoryGit'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, repoRoot, paths, action } = await readBody(event) as {
    scope?: string; projectPath?: string; repoRoot?: string; paths?: string[]; action?: string
  }
  if ((scope !== 'global' && scope !== 'project') || !repoRoot || !Array.isArray(paths) || !paths.length || (action !== 'stage' && action !== 'unstage')) {
    throw createError({ statusCode: 400, message: 'scope, repoRoot, paths and action (stage|unstage) are required' })
  }
  try {
    const { root } = await resolveRepoRequest(scope as MemoryScope, projectPath, repoRoot, paths)
    await stagePaths(root, paths, action)
    return { success: true }
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }
})
