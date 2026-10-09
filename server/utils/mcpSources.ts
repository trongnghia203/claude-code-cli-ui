import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveHome } from './path'
import { resolveClaudePath } from './claudeDir'

export interface McpSourceServer {
  name: string
  transport?: string
}

export interface McpSources {
  /** <project>/.mcp.json, shared with the team */
  project: { path: string; exists: boolean; servers: McpSourceServer[] }
  /** ~/.claude.json top-level mcpServers (user scope) */
  global: McpSourceServer[]
  /** ~/.claude.json projects[<dir>].mcpServers (local scope: private to you, this project) */
  local: McpSourceServer[]
  /** Servers shipped by installed and enabled plugins (their .mcp.json) */
  plugins: { plugin: string; servers: McpSourceServer[] }[]
}

async function readJson(path: string): Promise<any | null> {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

function toServers(map: unknown): McpSourceServer[] {
  if (!map || typeof map !== 'object') return []
  return Object.entries(map as Record<string, any>)
    .map(([name, cfg]) => ({
      name,
      transport: cfg?.transport || cfg?.type || (cfg?.command ? 'stdio' : cfg?.url ? 'http' : undefined),
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A project's .mcp.json path and servers, or null when there is none (or it cannot be parsed). */
export async function loadProjectMcpFile(workingDir: string): Promise<{ path: string; servers: McpSourceServer[] } | null> {
  const path = join(resolveHome(workingDir), '.mcp.json')
  const data = await readJson(path)
  if (!data) return null
  return { path, servers: toServers(data.mcpServers) }
}

export async function getMcpSources(workingDir?: string): Promise<McpSources> {
  const dir = workingDir ? resolveHome(workingDir) : ''
  const projectPath = dir ? join(dir, '.mcp.json') : ''
  const projectData = projectPath ? await readJson(projectPath) : null

  const claudeJson = await readJson(join(homedir(), '.claude.json'))

  // Plugins: installed + enabled ones that ship an .mcp.json (either {mcpServers:{...}} or a bare map)
  const plugins: McpSources['plugins'] = []
  const installed = await readJson(resolveClaudePath('plugins', 'installed_plugins.json'))
  const settings = await readJson(resolveClaudePath('settings.json'))
  const enabled: Record<string, boolean> = settings?.enabledPlugins ?? {}
  for (const [id, entries] of Object.entries<any[]>(installed?.plugins ?? {})) {
    if (enabled[id] === false) continue
    const installPath = entries?.[0]?.installPath
    if (!installPath) continue
    const data = await readJson(join(installPath, '.mcp.json'))
    const servers = toServers(data?.mcpServers ?? data)
    if (servers.length) plugins.push({ plugin: id.split('@')[0]!, servers })
  }
  plugins.sort((a, b) => a.plugin.localeCompare(b.plugin))

  return {
    project: { path: projectPath, exists: !!projectData, servers: toServers(projectData?.mcpServers) },
    global: toServers(claudeJson?.mcpServers),
    local: dir ? toServers(claudeJson?.projects?.[dir]?.mcpServers) : [],
    plugins,
  }
}
