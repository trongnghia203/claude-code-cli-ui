import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

interface ProjectInfo {
  claudeMd: string | null
  agentsMd: string | null
  settings: Record<string, unknown> | null
  settingsLocal: Record<string, unknown> | null
}

async function tryRead(path: string): Promise<string | null> {
  if (!existsSync(path)) return null
  try { return await readFile(path, 'utf-8') } catch { return null }
}

async function tryReadJson(path: string): Promise<Record<string, unknown> | null> {
  const raw = await tryRead(path)
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}

export default defineEventHandler(async (event) => {
  const { workingDir } = getQuery(event) as { workingDir?: string }

  if (!workingDir) {
    return { claudeMd: null, agentsMd: null, settings: null, settingsLocal: null } satisfies ProjectInfo
  }

  const [claudeMd, agentsMd, settings, settingsLocal] = await Promise.all([
    tryRead(join(workingDir, 'CLAUDE.md')),
    tryRead(join(workingDir, 'AGENTS.md')),
    tryReadJson(join(workingDir, '.claude', 'settings.json')),
    tryReadJson(join(workingDir, '.claude', 'settings.local.json')),
  ])

  return { claudeMd, agentsMd, settings, settingsLocal } satisfies ProjectInfo
})
