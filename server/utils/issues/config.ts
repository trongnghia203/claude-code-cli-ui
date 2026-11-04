import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveClaudePath } from '../claudeDir'
import { listIssues, updateIssue } from './store'

/** Issue settings: labels, custom properties, wakeup rules. A default file, plus an optional file per project. */

export const PROPERTY_TYPES = ['text', 'number', 'select', 'date', 'checkbox', 'url'] as const
export type PropertyType = typeof PROPERTY_TYPES[number]
export const MAX_ACTIVE_PROPERTIES = 20
export const MAX_ISSUE_LABELS = 20

export interface IssueLabel { id: string; name: string; color: string; description: string; updatedAt: string }
export interface PropertyOption { id: string; name: string }
export interface IssueProperty {
  id: string
  name: string
  type: PropertyType
  options: PropertyOption[]
  /** Missing on properties made before colors existed: the UI falls back to gray */
  color?: string
  archived: boolean
  updatedAt: string
}
export interface WakeupRule { enabled: boolean; instruction: string }
/** A saved board setup. `filters` and `display` are the shapes in app/composables/useIssueView.ts, stored as given (size capped). */
export interface IssueView {
  id: string
  name: string
  layout: 'board' | 'list'
  filters: Record<string, unknown>
  display: Record<string, unknown>
  updatedAt: string
}
export interface IssueConfig {
  labels: IssueLabel[]
  properties: IssueProperty[]
  views: IssueView[]
  wakeups: { subIssuesFinish: WakeupRule }
}

export const LABEL_COLORS = ['#6b7280', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'] as const

/** Used when the instruction setting is empty. */
export const DEFAULT_SUB_ISSUES_INSTRUCTION =
  'Every sub-issue of this issue is closed. Review what each one delivered, bring the results together on this issue, '
  + 'and finish with a short summary of what is done and what still needs review.'

const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`

/**
 * Two places hold settings:
 * - default: ~/.claude/issues/_config.json, used by every project without its own file
 * - project: ~/.config/claude-ui/issues/<project>/_config.json, replaces the default as a whole for that project
 */
const defaultFile = () => join(resolveClaudePath('issues'), '_config.json')
/** Same slug rule as Claude Code session folders and app/utils/projectSlug.ts */
const slugOf = (dir: string) => dir.replace(/\/+$/, '').replace(/[^a-zA-Z0-9]/g, '-')
const projectFile = (dir: string) => join(homedir(), '.config', 'claude-ui', 'issues', slugOf(dir), '_config.json')
export const hasProjectConfig = (dir?: string | null) => !!dir && existsSync(projectFile(dir))

const defaults = (): IssueConfig => ({
  labels: [],
  properties: [],
  views: [],
  wakeups: { subIssuesFinish: { enabled: true, instruction: '' } },
})

function save(file: string, cfg: IssueConfig) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(cfg, null, 2))
  renameSync(tmp, file)
}

/** The issues that read a given config: one project's, or every project that has no file of its own (the default). */
export function issuesInScope(projectDir?: string | null) {
  const all = listIssues()
  return projectDir
    ? all.filter(i => i.projectDir === projectDir.replace(/\/+$/, ''))
    : all.filter(i => !hasProjectConfig(i.projectDir))
}

/**
 * First read with no default file: issues from before this feature hold label names, not ids.
 * Create one label per distinct name and rewrite those issues to ids, once.
 */
function migrate(): IssueConfig {
  const cfg = defaults()
  const now = new Date().toISOString()
  const byName = new Map<string, string>()
  const issues = listIssues()
  for (const i of issues) {
    for (const name of i.labels ?? []) {
      if (byName.has(name.toLowerCase())) continue
      const id = newId('lbl')
      byName.set(name.toLowerCase(), id)
      cfg.labels.push({ id, name, color: LABEL_COLORS[cfg.labels.length % LABEL_COLORS.length]!, description: '', updatedAt: now })
    }
  }
  // Write the config first: a crash half way leaves ids in some issues, and the labels they point at exist
  save(defaultFile(), cfg)
  for (const i of issues) {
    if (!i.labels?.length) continue
    updateIssue(i.id, (x) => { x.labels = x.labels.map(n => byName.get(n.toLowerCase()) ?? n) })
  }
  return cfg
}

function readFile(file: string): IssueConfig {
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8'))
    const d = defaults()
    return {
      labels: Array.isArray(raw.labels) ? raw.labels : d.labels,
      properties: Array.isArray(raw.properties) ? raw.properties : d.properties,
      views: Array.isArray(raw.views) ? raw.views : d.views,
      wakeups: { subIssuesFinish: { ...d.wakeups.subIssuesFinish, ...raw.wakeups?.subIssuesFinish } },
    }
  } catch {
    return defaults()
  }
}

/** The config a project sees: its own file when it has one, else the default. */
export function readConfig(projectDir?: string | null): IssueConfig {
  if (hasProjectConfig(projectDir)) return readFile(projectFile(projectDir!))
  if (!existsSync(defaultFile())) return migrate()
  return readFile(defaultFile())
}

/**
 * Synchronous read-modify-write of one scope: the project file (it must exist) or, with no project, the default.
 * Same model as the issue store.
 */
export function mutateConfig<T>(projectDir: string | null | undefined, fn: (cfg: IssueConfig) => T): T {
  const scoped = !!projectDir
  if (scoped && !hasProjectConfig(projectDir)) throw createError({ statusCode: 400, message: 'This project uses the default settings. Customize it first.' })
  const cfg = scoped ? readFile(projectFile(projectDir!)) : readConfig(null)
  const out = fn(cfg)
  save(scoped ? projectFile(projectDir!) : defaultFile(), cfg)
  return out
}

/** Give a project its own file, starting as a copy of the default. Ids are kept, so issues keep their labels. */
export function customizeProject(projectDir: string) {
  if (!hasProjectConfig(projectDir)) save(projectFile(projectDir), readConfig(null))
}

/**
 * What a reset would lose: labels and properties that only the project file has, and that its issues still use.
 * Empty means a reset is safe.
 */
export function resetBlockers(projectDir: string): string[] {
  if (!hasProjectConfig(projectDir)) return []
  const base = readConfig(null)
  const own = readConfig(projectDir)
  const used = usageCounts(projectDir)
  return [
    ...own.labels.filter(l => !base.labels.some(b => b.id === l.id) && used.labels[l.id]).map(l => `label "${l.name}"`),
    ...own.properties.filter(p => !base.properties.some(b => b.id === p.id) && used.properties[p.id]).map(p => `property "${p.name}"`),
  ]
}

/** Drop the project file: the project follows the default again. Refused while its issues use things only the project has. */
export function resetProject(projectDir: string) {
  if (!hasProjectConfig(projectDir)) return
  const blockers = resetBlockers(projectDir)
  if (blockers.length) throw createError({ statusCode: 409, message: `Cannot reset: still in use by issues: ${blockers.join(', ')}.` })
  rmSync(projectFile(projectDir), { force: true })
}

export const newLabelId = () => newId('lbl')
export const newViewId = () => newId('view')
export const newPropertyId = () => newId('prop')
export const newOptionId = () => newId('opt')

/** Count how many issues use each label and property id, among the issues that read this scope. */
export function usageCounts(projectDir?: string | null) {
  const labels: Record<string, number> = {}
  const properties: Record<string, number> = {}
  for (const i of issuesInScope(projectDir)) {
    for (const l of i.labels ?? []) labels[l] = (labels[l] ?? 0) + 1
    for (const k of Object.keys(i.properties ?? {})) properties[k] = (properties[k] ?? 0) + 1
  }
  return { labels, properties }
}

/** Labels and properties can be shared with other projects: the same item (same id) lives in each project's own file. */
export type ShareKind = 'labels' | 'properties'

/**
 * The projects an item can be shared with: the ones the user created, plus any directory that already has its own
 * settings file (so an existing share never disappears from the list).
 */
export async function knownProjects(): Promise<{ dir: string; name: string }[]> {
  const { listUserProjects } = await import('../userProjects')
  const out = new Map<string, string>()
  for (const p of listUserProjects()) out.set(p.path.replace(/\/+$/, ''), p.name)
  for (const i of listIssues()) {
    if (!out.has(i.projectDir) && hasProjectConfig(i.projectDir)) out.set(i.projectDir, i.projectDir.split('/').filter(Boolean).pop() || i.projectDir)
  }
  return [...out].map(([dir, name]) => ({ dir, name })).sort((a, b) => a.name.localeCompare(b.name))
}

/** Which known projects can see this item now. `custom` = the project has its own settings file. */
export async function itemProjects(kind: ShareKind, id: string) {
  return (await knownProjects()).map(p => ({
    ...p,
    custom: hasProjectConfig(p.dir),
    has: (readConfig(p.dir)[kind] as { id: string }[]).some(x => x.id === id),
  }))
}

/**
 * Make `dirs` the projects that have this item (among the known ones). Adding gives a project its own file when it has none.
 * Removing is refused while that project's issues still use the item.
 * `source` is the config scope the item is read from (a project dir, or null for the default).
 */
export async function setItemProjects(kind: ShareKind, id: string, source: string | null, dirs: string[]) {
  const item = (readConfig(source)[kind] as any[]).find(x => x.id === id)
  if (!item) throw createError({ statusCode: 404, message: 'Not found' })
  const want = new Set(dirs.map(d => d.replace(/\/+$/, '')))
  const errors: string[] = []
  for (const p of await itemProjects(kind, id)) {
    if (p.has === want.has(p.dir)) continue
    if (want.has(p.dir)) {
      const clash = (readConfig(p.dir)[kind] as any[]).find(x => x.name.toLowerCase() === item.name.toLowerCase())
      if (clash) { errors.push(`${p.name} already has "${item.name}"`); continue }
      customizeProject(p.dir)
      mutateConfig(p.dir, (cfg) => { (cfg[kind] as any[]).push({ ...item }) })
    } else {
      const used = usageCounts(p.dir)[kind][id] ?? 0
      if (used) { errors.push(`${p.name} still uses "${item.name}" on ${used} issue(s)`); continue }
      customizeProject(p.dir)
      mutateConfig(p.dir, (cfg) => { (cfg as any)[kind] = (cfg[kind] as any[]).filter(x => x.id !== id) })
    }
  }
  if (errors.length) throw createError({ statusCode: 409, message: errors.join('. ') })
}
