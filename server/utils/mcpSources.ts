import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { resolveHome } from './path'
import { resolveClaudePath } from './claudeDir'
import { loadSettingsLayers, mergeLayers, resolveEntry } from './effectiveSettings'

/**
 * Why a server is (not) usable in a project:
 * - denied: blocked by a `deniedMcpServers` rule in any settings file
 * - disabled: switched off in `~/.claude.json` (`disabledMcpServers`, the /mcp menu toggle)
 * - rejected: a project `.mcp.json` server listed in `disabledMcpjsonServers`
 * - pending: a project `.mcp.json` server that is not approved yet
 */
export type McpStatus = 'active' | 'denied' | 'disabled' | 'rejected' | 'pending'

export interface McpSourceServer {
  name: string
  transport?: string
  status: McpStatus
  /** Which setting decided the status, when it is not `active` */
  reason?: string
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
  /** claude.ai connectors: the ones ever connected plus any named in `deniedMcpServers` */
  connectors: McpSourceServer[]
}

interface RawServer {
  name: string
  transport?: string
  url?: string
  command?: string[]
  /** Names Claude Code may know this server by (plugin servers are `plugin:<plugin>:<name>`) */
  aliases: string[]
}

interface DenyRule {
  serverName?: string
  serverUrl?: string
  serverCommand?: string[]
}

async function readJson(path: string): Promise<any | null> {
  try {
    if (!existsSync(path)) return null
    return JSON.parse(await readFile(path, 'utf-8'))
  } catch {
    return null
  }
}

function toRawServers(map: unknown, aliasPrefix = ''): RawServer[] {
  if (!map || typeof map !== 'object') return []
  return Object.entries(map as Record<string, any>)
    .map(([name, cfg]) => ({
      name,
      transport: cfg?.transport || cfg?.type || (cfg?.command ? 'stdio' : cfg?.url ? 'http' : undefined),
      url: typeof cfg?.url === 'string' ? cfg.url : undefined,
      command: cfg?.command ? [cfg.command, ...(Array.isArray(cfg.args) ? cfg.args : [])] : undefined,
      aliases: aliasPrefix ? [name, `${aliasPrefix}${name}`] : [name],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  return new RegExp(`^${escaped}$`)
}

function matchesDenyRule(server: RawServer, rule: DenyRule): boolean {
  if (rule.serverName) return server.aliases.includes(rule.serverName)
  if (rule.serverUrl) return !!server.url && globToRegExp(rule.serverUrl).test(server.url)
  if (rule.serverCommand) {
    return !!server.command
      && server.command.length === rule.serverCommand.length
      && server.command.every((part, i) => part === rule.serverCommand![i])
  }
  return false
}

interface StatusContext {
  denyRules: DenyRule[]
  disabled: Set<string>
  /** Only set for servers that come from the project .mcp.json */
  approval?: { enableAll: boolean; enabled: Set<string>; rejected: Set<string> }
}

function toSource(server: RawServer, ctx: StatusContext): McpSourceServer {
  const base = { name: server.name, transport: server.transport }
  if (ctx.denyRules.some(rule => matchesDenyRule(server, rule))) {
    return { ...base, status: 'denied', reason: 'deniedMcpServers' }
  }
  if (server.aliases.some(alias => ctx.disabled.has(alias))) {
    return { ...base, status: 'disabled', reason: 'disabledMcpServers (~/.claude.json)' }
  }
  if (ctx.approval) {
    const { enableAll, enabled, rejected } = ctx.approval
    if (rejected.has(server.name)) return { ...base, status: 'rejected', reason: 'disabledMcpjsonServers' }
    if (!enableAll && !enabled.has(server.name)) {
      return { ...base, status: 'pending', reason: 'not in enabledMcpjsonServers' }
    }
  }
  return { ...base, status: 'active' }
}

function toStringSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])
}

/** A project's .mcp.json path and servers, or null when there is none (or it cannot be parsed). */
export async function loadProjectMcpFile(workingDir: string): Promise<{ path: string; servers: McpSourceServer[] } | null> {
  const path = join(resolveHome(workingDir), '.mcp.json')
  const data = await readJson(path)
  if (!data) return null
  return {
    path,
    servers: toRawServers(data.mcpServers).map(s => ({ name: s.name, transport: s.transport, status: 'active' as const })),
  }
}

export async function getMcpSources(workingDir?: string): Promise<McpSources> {
  const dir = workingDir ? resolveHome(workingDir) : ''
  const projectPath = dir ? join(dir, '.mcp.json') : ''
  const projectData = projectPath ? await readJson(projectPath) : null

  const claudeJson = await readJson(join(homedir(), '.claude.json'))

  const layers = await loadSettingsLayers(workingDir)
  const merged = mergeLayers(layers)
  const denyRules: DenyRule[] = Array.isArray(merged.deniedMcpServers) ? merged.deniedMcpServers : []
  const disabled = new Set([
    ...toStringSet(claudeJson?.disabledMcpServers),
    ...(dir ? toStringSet(claudeJson?.projects?.[dir]?.disabledMcpServers) : []),
  ])
  const plain: StatusContext = { denyRules, disabled }
  const approval = {
    enableAll: merged.enableAllProjectMcpServers === true,
    enabled: toStringSet(merged.enabledMcpjsonServers),
    rejected: toStringSet(merged.disabledMcpjsonServers),
  }

  // Plugins: installed + enabled ones that ship an .mcp.json (either {mcpServers:{...}} or a bare map).
  // "Enabled" follows the project's effective enabledPlugins, not only the global file.
  const plugins: McpSources['plugins'] = []
  const installed = await readJson(resolveClaudePath('plugins', 'installed_plugins.json'))
  for (const [id, entries] of Object.entries<any[]>(installed?.plugins ?? {})) {
    if (resolveEntry<boolean>(layers, 'enabledPlugins', id)?.value === false) continue
    const installPath = entries?.[0]?.installPath
    if (!installPath) continue
    const data = await readJson(join(installPath, '.mcp.json'))
    const pluginName = id.split('@')[0]!
    const servers = toRawServers(data?.mcpServers ?? data, `plugin:${pluginName}:`).map(s => toSource(s, plain))
    if (servers.length) plugins.push({ plugin: pluginName, servers })
  }
  plugins.sort((a, b) => a.plugin.localeCompare(b.plugin))

  // claude.ai connectors are not in any config file; list the ones ever connected and the ones a deny rule names
  const connectorNames = new Set<string>([
    ...(Array.isArray(claudeJson?.claudeAiMcpEverConnected) ? claudeJson.claudeAiMcpEverConnected : []),
    ...denyRules.map(rule => rule.serverName).filter((n): n is string => !!n && n.startsWith('claude.ai ')),
  ])
  const connectors = [...connectorNames]
    .sort((a, b) => a.localeCompare(b))
    .map(name => toSource({ name, aliases: [name] }, plain))

  return {
    project: {
      path: projectPath,
      exists: !!projectData,
      servers: toRawServers(projectData?.mcpServers).map(s => toSource(s, { ...plain, approval })),
    },
    global: toRawServers(claudeJson?.mcpServers).map(s => toSource(s, plain)),
    local: dir ? toRawServers(claudeJson?.projects?.[dir]?.mcpServers).map(s => toSource(s, plain)) : [],
    plugins,
    connectors,
  }
}
