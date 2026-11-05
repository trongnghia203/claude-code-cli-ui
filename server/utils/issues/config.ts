import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { resolveClaudePath } from '../claudeDir'
import { ISSUE_STATUSES, listIssues, updateIssue, type StatusAssignees } from './store'

/** Issue settings: labels, custom properties, saved views, wakeup rules. One global file, shared by every project. */

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
interface IssueView {
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
  /** Assignee set when an issue enters a status (ADR 0013) */
  statusAssignees: StatusAssignees
}

export const LABEL_COLORS = ['#6b7280', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6'] as const

/** Used when the instruction setting is empty. */
export const DEFAULT_SUB_ISSUES_INSTRUCTION =
  'Every sub-issue of this issue is closed. Review what each one delivered, bring the results together on this issue, '
  + 'and finish with a short summary of what is done and what still needs review.'

const newId = (prefix: string) => `${prefix}_${randomUUID().slice(0, 8)}`

/**
 * Settings live in ~/.claude/issues/_config.json. Issues manage work across projects, so nothing here is per project.
 * Older per-project files in ~/.config/claude-ui/issues/<project>/ are merged in once, see consolidate().
 */
const defaultFile = () => join(resolveClaudePath('issues'), '_config.json')
/** Same slug rule as Claude Code session folders and app/utils/projectSlug.ts */
const slugOf = (dir: string) => dir.replace(/\/+$/, '').replace(/[^a-zA-Z0-9]/g, '-')
const legacyRoot = () => join(homedir(), '.config', 'claude-ui', 'issues')

const defaults = (): IssueConfig => ({
  labels: [],
  properties: [],
  views: [],
  wakeups: { subIssuesFinish: { enabled: true, instruction: '' } },
  statusAssignees: {},
})

function save(file: string, cfg: IssueConfig) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(cfg, null, 2))
  renameSync(tmp, file)
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

/** Keep only known statuses with a string or null value. */
export function cleanStatusAssignees(raw: unknown): StatusAssignees {
  const out: StatusAssignees = {}
  if (!raw || typeof raw !== 'object') return out
  for (const st of ISSUE_STATUSES) {
    const v = (raw as Record<string, unknown>)[st]
    if (v === null || (typeof v === 'string' && v)) out[st] = v
  }
  return out
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
      statusAssignees: cleanStatusAssignees(raw.statusAssignees),
    }
  } catch {
    return defaults()
  }
}

export function readConfig(): IssueConfig {
  if (!existsSync(defaultFile())) migrate()
  consolidate()
  return readFile(defaultFile())
}

/** Synchronous read-modify-write of the settings file. Same model as the issue store. */
export function mutateConfig<T>(fn: (cfg: IssueConfig) => T): T {
  const cfg = readConfig()
  const out = fn(cfg)
  save(defaultFile(), cfg)
  return out
}

/**
 * One-time move from per-project settings files to the global one. Runs once per server start and does nothing when
 * no legacy file is left. Labels, properties and views merge into the global file by id, then by name; issues and
 * views that point at a merged-away id are rewritten. A merged view with no project filter gets one for its project,
 * so it keeps showing only that project's issues. Wakeup rules of project files are dropped. Each legacy file is
 * renamed to `_config.json.before-global.bak`, so nothing is lost and it is not read again.
 */
let consolidated = false
function consolidate() {
  if (consolidated) return
  consolidated = true
  const root = legacyRoot()
  if (!existsSync(root)) return
  const legacy = readdirSync(root, { withFileTypes: true })
    .filter(d => d.isDirectory()).map(d => ({ slug: d.name, file: join(root, d.name, '_config.json') })).filter(x => existsSync(x.file))
  if (!legacy.length) return

  const base = readFile(defaultFile())
  const issues = listIssues()
  const labelMap = new Map<string, string>() // merged-away id -> kept id
  const propMap = new Map<string, string>()
  const optionMap = new Map<string, Map<string, string>>() // merged-away select property id -> (old option id -> kept option id)
  const incomingViews: IssueView[] = []
  for (const { slug, file } of legacy) {
    const cfg = readFile(file)
    for (const l of cfg.labels) {
      if (base.labels.some(b => b.id === l.id)) continue
      const same = base.labels.find(b => b.name.toLowerCase() === l.name.toLowerCase())
      if (same) labelMap.set(l.id, same.id)
      else base.labels.push(l)
    }
    for (const p of cfg.properties) {
      if (base.properties.some(b => b.id === p.id)) continue
      const same = base.properties.find(b => b.name.toLowerCase() === p.name.toLowerCase())
      if (!same) { base.properties.push(p); continue }
      if (same.type !== p.type) { base.properties.push({ ...p, name: `${p.name} (${p.type})` }); continue }
      propMap.set(p.id, same.id)
      if (p.type === 'select') {
        const m = new Map<string, string>()
        for (const o of p.options) {
          const hit = same.options.find(x => x.name.toLowerCase() === o.name.toLowerCase())
          if (hit) m.set(o.id, hit.id)
          else same.options.push(o)
        }
        optionMap.set(p.id, m)
      }
    }
    const dir = issues.find(i => slugOf(i.projectDir) === slug)?.projectDir
    for (const v of cfg.views) {
      if (base.views.some(b => b.id === v.id)) continue
      const filters = { ...v.filters }
      const hasProject = Array.isArray(filters.project) && filters.project.length > 0
      incomingViews.push({ ...v, filters: dir && !hasProject ? { ...filters, project: [dir] } : filters })
    }
  }
  for (const v of incomingViews) {
    let name = v.name
    for (let n = 2; base.views.some(b => b.name.toLowerCase() === name.toLowerCase()); n++) name = `${v.name} ${n}`
    base.views.push({ ...v, name })
  }

  // Views name labels and properties by id (also as `prop:<id>`): swap merged-away ids for the kept ones
  const swapIds = <T>(v: T): T => {
    let json = JSON.stringify(v)
    for (const [from, to] of [...labelMap, ...propMap]) json = json.split(`"${from}"`).join(`"${to}"`).split(`prop:${from}`).join(`prop:${to}`)
    return JSON.parse(json)
  }
  base.views = swapIds(base.views)
  // Write the global file first: a crash half way leaves legacy files in place, and the next start merges again
  save(defaultFile(), base)

  if (labelMap.size || propMap.size) {
    for (const i of issues) {
      const props = Object.keys(i.properties ?? {})
      if (!(i.labels ?? []).some(id => labelMap.has(id)) && !props.some(k => propMap.has(k))) continue
      updateIssue(i.id, (x) => {
        x.labels = (x.labels ?? []).map(id => labelMap.get(id) ?? id)
        const next: Record<string, string | number | boolean> = {}
        for (const [k, v] of Object.entries(x.properties ?? {})) {
          const om = optionMap.get(k)
          next[propMap.get(k) ?? k] = om && typeof v === 'string' ? (om.get(v) ?? v) : v
        }
        x.properties = next
      })
    }
  }
  for (const { file } of legacy) renameSync(file, `${file}.before-global.bak`)
}

export const newLabelId = () => newId('lbl')
export const newViewId = () => newId('view')
export const newPropertyId = () => newId('prop')
export const newOptionId = () => newId('opt')

/** Count how many issues use each label and property id, across all projects. */
export function usageCounts() {
  const labels: Record<string, number> = {}
  const properties: Record<string, number> = {}
  for (const i of listIssues()) {
    for (const l of i.labels ?? []) labels[l] = (labels[l] ?? 0) + 1
    for (const k of Object.keys(i.properties ?? {})) properties[k] = (properties[k] ?? 0) + 1
  }
  return { labels, properties }
}
