import { listMemoryFiles, type MemoryScope } from '../../utils/memoryFiles'

export default defineEventHandler(async (event) => {
  const { scope, path } = getQuery(event) as { scope?: string; path?: string }
  if (scope !== 'global' && scope !== 'project') {
    throw createError({ statusCode: 400, message: 'scope must be "global" or "project"' })
  }
  return { files: await listMemoryFiles(scope as MemoryScope, path) }
})
