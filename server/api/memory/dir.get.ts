import { listMemoryDir, type MemoryScope } from '../../utils/memoryFiles'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, dir } = getQuery(event) as { scope?: string; projectPath?: string; dir?: string }
  if (scope !== 'global' && scope !== 'project') {
    throw createError({ statusCode: 400, message: 'scope must be "global" or "project"' })
  }
  if (scope === 'project' && !projectPath) throw createError({ statusCode: 400, message: 'projectPath is required' })
  const listing = await listMemoryDir(scope as MemoryScope, projectPath, dir ?? '')
  if (!listing) throw createError({ statusCode: 403, message: 'Folder not available' })
  return listing
})
