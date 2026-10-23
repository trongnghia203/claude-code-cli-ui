import { readFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveClaudePath } from '../../utils/claudeDir'
import { parseFrontmatter } from '../../utils/frontmatter'
import { resolvePluginInstallPath } from '../../utils/marketplace'
import { loadSettingsLayers, resolveEntry } from '../../utils/effectiveSettings'
import type { PluginDetail, SkillFrontmatter } from '~/types'

interface InstalledEntry {
  scope: string
  installPath: string
  version: string
  installedAt: string
  lastUpdated: string
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

export default defineEventHandler(async (event) => {
  const id = decodeURIComponent(getRouterParam(event, 'id')!)
  const { workingDir } = getQuery(event) as { workingDir?: string }
  const installedPath = resolveClaudePath('plugins', 'installed_plugins.json')

  const installed = await readJson<{ plugins: Record<string, InstalledEntry[]> }>(installedPath)
  const entries = installed?.plugins?.[id]
  if (!entries?.length) {
    throw createError({ statusCode: 404, message: `Plugin not found: ${id}` })
  }

  const entry = entries[0]
  const [name, marketplace] = id.split('@')
  const installPath = resolvePluginInstallPath(id, entry.installPath)
  const pluginJsonPath = join(installPath, '.claude-plugin', 'plugin.json')
  const meta = await readJson<PluginJson>(pluginJsonPath)

  // Effective state for the selected project (project and local settings override the global entry)
  const setting = resolveEntry<boolean>(await loadSettingsLayers(workingDir), 'enabledPlugins', id)

  // Load skills
  const skillDetails = []
  const skillsDir = join(installPath, 'skills')
  if (existsSync(skillsDir)) {
    const skillDirs = await readdir(skillsDir, { withFileTypes: true })
    for (const dir of skillDirs) {
      if (!dir.isDirectory()) continue
      const skillPath = join(skillsDir, dir.name, 'SKILL.md')
      if (!existsSync(skillPath)) continue
      const raw = await readFile(skillPath, 'utf-8')
      const { frontmatter, body } = parseFrontmatter<SkillFrontmatter>(raw)
      skillDetails.push({
        slug: dir.name,
        frontmatter: { name: dir.name, ...frontmatter },
        body,
        filePath: skillPath,
      })
    }
  }

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
    skills: skillDetails.map(s => s.slug),
    author: meta?.author,
    skillDetails: skillDetails.sort((a, b) => a.slug.localeCompare(b.slug)),
  } satisfies PluginDetail
})
