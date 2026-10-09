import { writeFile, mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'
import { resolveAllowedMemoryFile, type MemoryScope } from '../../utils/memoryFiles'

export default defineEventHandler(async (event) => {
  const { scope, projectPath, path, content } = await readBody(event) as {
    scope?: string; projectPath?: string; path?: string; content?: string
  }
  if ((scope !== 'global' && scope !== 'project') || !path || typeof content !== 'string') {
    throw createError({ statusCode: 400, message: 'scope, path and content are required' })
  }
  const file = await resolveAllowedMemoryFile(scope as MemoryScope, projectPath, path)
  if (!file) throw createError({ statusCode: 403, message: 'Not a known memory file' })
  try {
    await mkdir(dirname(file.path), { recursive: true })
    await writeFile(file.path, content, 'utf-8')
    return { success: true, path: file.path }
  } catch (e: any) {
    throw createError({ statusCode: 500, message: `Failed to save file: ${e.message}` })
  }
})
