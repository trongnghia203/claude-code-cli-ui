import { listMemoryFiles, type MemoryScope } from '../../../utils/memoryFiles'
import { getRepoStates } from '../../../utils/memoryGit'

export default defineEventHandler(async (event) => {
  const { scope, projectPath } = getQuery(event) as { scope?: string; projectPath?: string }
  if (scope !== 'global' && scope !== 'project') {
    throw createError({ statusCode: 400, message: 'scope must be "global" or "project"' })
  }
  const files = await listMemoryFiles(scope as MemoryScope, projectPath)
  return { repos: await getRepoStates(files) }
})
