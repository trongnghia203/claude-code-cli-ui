import { readFile } from 'node:fs/promises'
import { resolveAllowedMemoryFile, type MemoryScope } from '../../utils/memoryFiles'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, path } = getQuery(event) as { scope?: string; projectPath?: string; path?: string }
  if ((scope !== 'global' && scope !== 'project') || !path) {
    throw createError({ statusCode: 400, message: 'scope and path are required' })
  }
  const file = await resolveAllowedMemoryFile(scope as MemoryScope, projectPath, path)
  if (!file) throw createError({ statusCode: 403, message: 'Not a known memory file' })
  if (!file.exists) return { exists: false, content: '', path: file.path }
  try {
    return { exists: true, content: await readFile(file.path, 'utf-8'), path: file.path }
  } catch (e: any) {
    throw createError({ statusCode: 500, message: `Failed to read file: ${e.message}` })
  }
})
