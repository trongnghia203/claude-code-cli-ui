import type { MemoryScope } from '../../../utils/memoryFiles'
import { resolveRepoRequest, pushRepo } from '../../../utils/memoryGit'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, repoRoot } = await readBody(event) as { scope?: string; projectPath?: string; repoRoot?: string }
  if ((scope !== 'global' && scope !== 'project') || !repoRoot) {
    throw createError({ statusCode: 400, message: 'scope and repoRoot are required' })
  }
  try {
    const { root } = await resolveRepoRequest(scope as MemoryScope, projectPath, repoRoot)
    await pushRepo(root)
    return { pushed: true }
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }
})
