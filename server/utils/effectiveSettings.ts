import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { resolveHome } from './path'
import { resolveClaudePath } from './claudeDir'

export type SettingsLayer = 'user' | 'project' | 'local'
export type JsonObject = Record<string, any>

export interface SettingsLayers {
  user: JsonObject
  project: JsonObject
  local: JsonObject
}

export interface SettingsFiles {
  user: string
  project: string
  local: string
}

// Lowest to highest precedence: user (~/.claude), project (.claude/settings.json), local (.claude/settings.local.json)
const LAYER_ORDER: SettingsLayer[] = ['user', 'project', 'local']

async function readJson(path: string): Promise<JsonObject> {
  try {
    if (!path || !existsSync(path)) return {}
    const data = JSON.parse(await readFile(path, 'utf-8'))
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
  } catch {
    return {}
  }
}

export function settingsFiles(workingDir?: string): SettingsFiles {
  const dir = workingDir ? resolveHome(workingDir) : ''
  return {
    user: resolveClaudePath('settings.json'),
    project: dir ? join(dir, '.claude', 'settings.json') : '',
    local: dir ? join(dir, '.claude', 'settings.local.json') : '',
  }
}

/** The three settings files of a project, each parsed on its own (a missing or broken file is `{}`). */
export async function loadSettingsLayers(workingDir?: string): Promise<SettingsLayers> {
  const files = settingsFiles(workingDir)
  const [user, project, local] = await Promise.all([
    readJson(files.user),
    readJson(files.project),
    readJson(files.local),
  ])
  return { user, project, local }
}

function isPlainObject(value: unknown): value is JsonObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function mergeValues(base: unknown, next: unknown): unknown {
  if (Array.isArray(base) && Array.isArray(next)) {
    // Array settings (permissions, deniedMcpServers, enabledMcpjsonServers, ...) are concatenated and de-duplicated
    const seen = new Set<string>()
    return [...base, ...next].filter((item) => {
      const key = JSON.stringify(item)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  if (isPlainObject(base) && isPlainObject(next)) {
    const out: JsonObject = { ...base }
    for (const [key, value] of Object.entries(next)) out[key] = key in out ? mergeValues(out[key], value) : value
    return out
  }
  return next
}

/** What Claude Code sees: objects merged key by key, arrays concatenated, scalars taken from the highest layer. */
export function mergeLayers(layers: SettingsLayers): JsonObject {
  return LAYER_ORDER.reduce<JsonObject>((acc, layer) => mergeValues(acc, layers[layer]) as JsonObject, {})
}

/** Layers that define a top-level key, lowest precedence first. */
export function layersDefining(layers: SettingsLayers, key: string): SettingsLayer[] {
  return LAYER_ORDER.filter(layer => key in layers[layer])
}

/** For a map setting such as `enabledPlugins` or `skillOverrides`: the winning value for one entry and its layer. */
export function resolveEntry<T = unknown>(
  layers: SettingsLayers,
  key: string,
  entry: string,
): { value: T; source: SettingsLayer } | undefined {
  for (const layer of [...LAYER_ORDER].reverse()) {
    const map = layers[layer][key]
    if (isPlainObject(map) && entry in map) return { value: map[entry] as T, source: layer }
  }
  return undefined
}

export async function getEffectiveSettings(workingDir?: string) {
  const files = settingsFiles(workingDir)
  const layers = await loadSettingsLayers(workingDir)
  const merged = mergeLayers(layers)
  const keys = Object.keys(merged)
    .sort((a, b) => a.localeCompare(b))
    .map(key => ({ key, sources: layersDefining(layers, key) }))
  return { files, layers, merged, keys }
}
