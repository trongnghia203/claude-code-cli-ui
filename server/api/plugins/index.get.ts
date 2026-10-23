import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../utils/claudeDir'
import { resolvePluginInstallPath } from '../../utils/marketplace'
import { loadSettingsLayers, resolveEntry } from '../../utils/effectiveSettings'
import type { Plugin } from '~/types'

interface InstalledEntry {
  scope: string
  installPath: string
  version: string
  installedAt: string
  lastUpdated: string
  gitCommitSha?: string
}

interface PluginJson {
  name: string
  description?: string
  version?: string
  author?: { name: string; email?: string }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    if (!existsSync(path)) return null
    const raw = await readFile(path, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

async function findSkills(installPath: string): Promise<string[]> {
  const skillsDir = join(installPath, 'skills')
  if (!existsSync(skillsDir)) return []
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true })
    return entries.filter(e => e.isDirectory()).map(e => e.name)
  } catch {
    return []
  }
}

export default defineEventHandler(async (event) => {
  const { workingDir } = getQuery(event) as { workingDir?: string }
  const installedPath = resolveClaudePath('plugins', 'installed_plugins.json')

  const installed = await readJson<{ plugins: Record<string, InstalledEntry[]> }>(installedPath)
  if (!installed?.plugins) return []

  // Effective state: project and local settings override the global enabledPlugins entry for the same plugin
  const layers = await loadSettingsLayers(workingDir)

  const plugins: Plugin[] = await Promise.all(
    Object.entries(installed.plugins).map(async ([id, entries]) => {
      const entry = entries[0]
      if (!entry) return null

      const [name, marketplace] = id.split('@')
      const installPath = resolvePluginInstallPath(id, entry.installPath)
      const pluginJsonPath = join(installPath, '.claude-plugin', 'plugin.json')
      const meta = await readJson<PluginJson>(pluginJsonPath)
      const skills = await findSkills(installPath)
      const setting = resolveEntry<boolean>(layers, 'enabledPlugins', id)

      return {
        id,
        name: meta?.name ?? name,
        marketplace: marketplace ?? 'unknown',
        description: meta?.description ?? '',
        version: entry.version,
        enabled: setting?.value ?? false,
        enabledSource: setting?.source,
        installedAt: entry.installedAt,
        lastUpdated: entry.lastUpdated,
        installPath: entry.installPath,
        skills,
        author: meta?.author,
      } satisfies Plugin
    })
  )

  return plugins.filter(Boolean).sort((a, b) => a!.name.localeCompare(b!.name))
})
