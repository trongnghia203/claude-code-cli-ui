import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHome } from '../../utils/path'

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const path = query.path as string

  if (!path) {
    throw createError({ statusCode: 400, message: 'Path is required' })
  }

  const expandedPath = resolveHome(path)
  // 'project' = shared .claude/settings.json, 'local' (default) = personal settings.local.json
  const file = query.scope === 'project' ? 'settings.json' : 'settings.local.json'
  const settingsPath = join(expandedPath, '.claude', file)

  if (!existsSync(settingsPath)) {
    return {}
  }

  try {
    const raw = await readFile(settingsPath, 'utf-8')
    return JSON.parse(raw)
  } catch (e) {
    console.error(`Failed to read settings for ${path}:`, e)
    return {}
  }
})
