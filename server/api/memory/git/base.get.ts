import type { MemoryScope } from '../../../utils/memoryFiles'
import { readHeadContent, resolveRepoRequest } from '../../../utils/memoryGit'

/** HEAD version of a memory file, used as the left side of the git diff. */
export default defineEventHandler(async (event) => {
  const { scope, projectPath, repoRoot, path } = getQuery(event) as {
    scope?: string; projectPath?: string; repoRoot?: string; path?: string
  }
  if ((scope !== 'global' && scope !== 'project') || !repoRoot || !path) {
    throw createError({ statusCode: 400, message: 'scope, repoRoot and path are required' })
  }
  try {
    const { root } = await resolveRepoRequest(scope as MemoryScope, projectPath, repoRoot, [path])
    return { content: await readHeadContent(root, path) }
  } catch (e: any) {
    throw createError({ statusCode: 422, message: e.message })
  }
})
