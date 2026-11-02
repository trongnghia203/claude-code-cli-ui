import type { IssueSummary } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_STATUSES, ISSUE_STATUS_META } from '~/composables/useIssues'
import type { IssueConfig, IssueProperty, IssueViewDef } from '~/composables/useIssueConfig'

/**
 * Filters, grouping and ordering for the Issues page (ADR 0003). The functions here are pure so they stay easy to check.
 * In an array filter the empty string means "no value" (unassigned, no label, ...).
 */

export type DateOp = 'today' | 'week' | 'overdue' | 'next7' | 'none'
export interface IssueFilters {
  status?: string[]
  priority?: string[]
  assignee?: string[]
  project?: string[]
  label?: string[]
  date?: { field: string; op: DateOp }
  /** property id -> option ids / 'true'|'false' / one text to look for */
  props?: Record<string, string[]>
}
export type GroupBy = string // 'status' | 'priority' | 'assignee' | 'label' | 'project' | 'prop:<id>'
export interface DisplayOptions {
  groupBy: GroupBy
  hiddenColumns: string[]
  orderBy: string // 'priority' | 'updatedAt' | 'createdAt' | 'title' | 'number' | 'prop:<id>'
  orderDir: 'asc' | 'desc'
  showSubIssues: boolean
  card: string[] // 'id' | 'priority' | 'assignee' | 'labels' | 'comments' | 'description' | 'project' | 'subProgress' | 'prop:<id>'
}
export type Layout = 'board' | 'list'

export const DEFAULT_CARD = ['id', 'priority', 'assignee', 'labels', 'comments']
export const defaultDisplay = (): DisplayOptions => ({
  groupBy: 'status', hiddenColumns: [], orderBy: 'priority', orderDir: 'asc', showSubIssues: true, card: [...DEFAULT_CARD],
})
export const BUILT_IN_CARD_FIELDS: { key: string; label: string }[] = [
  { key: 'id', label: 'ID' }, { key: 'priority', label: 'Priority' }, { key: 'description', label: 'Description' },
  { key: 'assignee', label: 'Assignee' }, { key: 'project', label: 'Project' }, { key: 'labels', label: 'Labels' },
  { key: 'comments', label: 'Comments' }, { key: 'subProgress', label: 'Sub-issue progress' },
]
export const DATE_OP_LABEL: Record<DateOp, string> = { today: 'Today', week: 'This week', overdue: 'Overdue', next7: 'Next 7 days', none: 'No date' }
const CLOSED = ['done', 'cancelled']

export interface Column { key: string; label: string; color?: string; icon?: string }
export interface ViewContext {
  config: IssueConfig
  agents: { slug: string; name: string }[]
  /** id -> issue, for sub-issue progress */
  all: IssueSummary[]
}

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

/** A date field of an issue as YYYY-MM-DD (local time), or '' */
export function dateOf(i: IssueSummary, field: string): string {
  if (field === 'createdAt' || field === 'updatedAt') return ymd(new Date(i[field]))
  const v = i.properties?.[field.replace(/^prop:/, '')]
  return typeof v === 'string' ? v : ''
}

function dateMatches(i: IssueSummary, f: { field: string; op: DateOp }, now: Date): boolean {
  const d = dateOf(i, f.field)
  if (f.op === 'none') return !d
  if (!d) return false
  const today = ymd(now)
  if (f.op === 'today') return d === today
  if (f.op === 'overdue') return d < today && !CLOSED.includes(i.status)
  if (f.op === 'next7') return d >= today && d <= ymd(addDays(now, 7))
  const monday = addDays(now, -((now.getDay() + 6) % 7))
  return d >= ymd(monday) && d <= ymd(addDays(monday, 6))
}

const propValue = (i: IssueSummary, id: string) => i.properties?.[id]

export function matchesFilters(i: IssueSummary, f: IssueFilters, config: IssueConfig, now = new Date()): boolean {
  if (f.status?.length && !f.status.includes(i.status)) return false
  if (f.priority?.length && !f.priority.includes(i.priority)) return false
  if (f.assignee?.length && !f.assignee.includes(i.assignee ?? '')) return false
  if (f.project?.length && !f.project.includes(i.projectDir)) return false
  if (f.label?.length) {
    // Ids that are not in this config are ignored, like the labels the card shows
    const known = i.labels.filter(l => config.labels.some(c => c.id === l))
    if (!(known.length ? known.some(l => f.label!.includes(l)) : f.label.includes(''))) return false
  }
  if (f.date && !dateMatches(i, f.date, now)) return false
  for (const [id, want] of Object.entries(f.props ?? {})) {
    if (!want.length) continue
    const def = config.properties.find(p => p.id === id)
    if (!def) continue // property removed: the filter is ignored
    const v = propValue(i, id)
    if (def.type === 'checkbox') { if (!want.includes(v === true ? 'true' : 'false')) return false }
    else if (def.type === 'select') { if (!want.includes(v === undefined ? '' : String(v))) return false }
    else if (!String(v ?? '').toLowerCase().includes(want[0]!.toLowerCase())) return false
  }
  return true
}

export const filterCount = (f: IssueFilters) =>
  (['status', 'priority', 'assignee', 'project', 'label'] as const).filter(k => f[k]?.length).length
  + (f.date ? 1 : 0) + Object.values(f.props ?? {}).filter(v => v.length).length

export interface FilterChip { key: string; text: string; /** the filters with this one removed */ without: IssueFilters }

/** The active filters as readable chips, each knowing how to drop itself. Shared by the page and the Save as view dialog. */
export function filterChips(f: IssueFilters, config: IssueConfig, agentName: (slug: string) => string): FilterChip[] {
  const out: FilterChip[] = []
  const list = (k: 'status' | 'priority' | 'assignee' | 'project' | 'label', title: string, name: (v: string) => string) => {
    if (f[k]?.length) out.push({ key: k, text: `${title}: ${f[k]!.map(name).join(', ')}`, without: { ...f, [k]: undefined } })
  }
  list('status', 'Status', v => v.replace('_', ' '))
  list('priority', 'Priority', v => ISSUE_PRIORITY_META[v as keyof typeof ISSUE_PRIORITY_META]?.label ?? v)
  list('assignee', 'Assignee', v => (v ? agentName(v) : 'Unassigned'))
  list('project', 'Project', v => v.split('/').filter(Boolean).pop() ?? v)
  list('label', 'Label', v => (v ? config.labels.find(l => l.id === v)?.name ?? 'removed' : 'No label'))
  if (f.date) {
    const field = f.date.field === 'createdAt' ? 'Created' : f.date.field === 'updatedAt' ? 'Updated' : config.properties.find(p => p.id === f.date!.field)?.name ?? 'removed'
    out.push({ key: 'date', text: `${field}: ${DATE_OP_LABEL[f.date.op]}`, without: { ...f, date: undefined } })
  }
  for (const [id, want] of Object.entries(f.props ?? {})) {
    const def = config.properties.find(p => p.id === id)
    const names = want.map(v => def?.type === 'select' ? (v ? def.options.find(o => o.id === v)?.name ?? 'removed' : `No ${def.name}`) : def?.type === 'checkbox' ? (v === 'true' ? 'Yes' : 'No') : v)
    const rest = { ...f.props }
    delete rest[id]
    out.push({ key: `prop:${id}`, text: `${def?.name ?? 'removed property'}: ${names.join(', ')}`, without: { ...f, props: Object.keys(rest).length ? rest : undefined } })
  }
  return out
}

export const groupableProps = (config: IssueConfig) => config.properties.filter(p => !p.archived && (p.type === 'select' || p.type === 'checkbox'))
export const dateProps = (config: IssueConfig) => config.properties.filter(p => !p.archived && p.type === 'date')

/** The columns for a grouping. Value-less issues go to a "No ..." column with the empty key. */
export function columnsFor(groupBy: GroupBy, issues: IssueSummary[], ctx: ViewContext): Column[] {
  if (groupBy === 'priority') return ISSUE_PRIORITIES.map(p => ({ key: p, label: ISSUE_PRIORITY_META[p].label, color: ISSUE_PRIORITY_META[p].color }))
    .sort((a, b) => ISSUE_PRIORITY_META[a.key as keyof typeof ISSUE_PRIORITY_META].rank - ISSUE_PRIORITY_META[b.key as keyof typeof ISSUE_PRIORITY_META].rank)
  if (groupBy === 'assignee') {
    const used = new Set(issues.map(i => i.assignee ?? ''))
    return [{ key: '', label: 'Unassigned', icon: 'i-lucide-user' }, ...ctx.agents.filter(a => used.has(a.slug)).map(a => ({ key: a.slug, label: a.name, icon: 'i-lucide-cpu' }))]
  }
  if (groupBy === 'label') return [...ctx.config.labels.map(l => ({ key: l.id, label: l.name, color: l.color })), { key: '', label: 'No label' }]
  if (groupBy === 'project') return [...new Set(issues.map(i => i.projectDir))].map(d => ({ key: d, label: d.split('/').filter(Boolean).pop() ?? d, icon: 'i-lucide-folder' }))
  if (groupBy.startsWith('prop:')) {
    const def = ctx.config.properties.find(p => p.id === groupBy.slice(5))
    if (def?.type === 'select') return [...def.options.map(o => ({ key: o.id, label: o.name })), { key: '', label: `No ${def.name}` }]
    if (def?.type === 'checkbox') return [{ key: 'true', label: 'Yes' }, { key: 'false', label: 'No' }]
  }
  return ISSUE_STATUSES.map(s => ({ key: s, label: ISSUE_STATUS_META[s].label, color: ISSUE_STATUS_META[s].color, icon: ISSUE_STATUS_META[s].icon }))
}

/** Which column keys an issue belongs to. Several labels put it in several columns. */
export function keysOf(i: IssueSummary, groupBy: GroupBy, config: IssueConfig): string[] {
  if (groupBy === 'priority') return [i.priority]
  if (groupBy === 'assignee') return [i.assignee ?? '']
  if (groupBy === 'project') return [i.projectDir]
  if (groupBy === 'label') { const k = i.labels.filter(l => config.labels.some(c => c.id === l)); return k.length ? k : [''] }
  if (groupBy.startsWith('prop:')) {
    const def = config.properties.find(p => p.id === groupBy.slice(5))
    const v = propValue(i, groupBy.slice(5))
    if (def?.type === 'checkbox') return [v === true ? 'true' : 'false']
    return [v === undefined ? '' : String(v)]
  }
  return [i.status]
}

export function sortIssues(list: IssueSummary[], d: DisplayOptions, config: IssueConfig): IssueSummary[] {
  const dir = d.orderDir === 'asc' ? 1 : -1
  const prop = d.orderBy.startsWith('prop:') ? config.properties.find(p => p.id === d.orderBy.slice(5)) : undefined
  const keyOf = (i: IssueSummary): string | number | undefined => {
    switch (d.orderBy) {
      case 'priority': return ISSUE_PRIORITY_META[i.priority].rank
      case 'title': return i.title.toLowerCase()
      case 'number': return i.number
      case 'createdAt': return i.createdAt
      case 'updatedAt': return i.updatedAt
    }
    if (!prop) return undefined
    const v = propValue(i, prop.id)
    if (v === undefined || v === '') return undefined
    if (prop.type === 'select') return prop.options.find(o => o.id === v)?.name.toLowerCase()
    return typeof v === 'boolean' ? Number(v) : typeof v === 'string' ? v.toLowerCase() : v
  }
  return [...list].sort((a, b) => {
    const x = keyOf(a), y = keyOf(b)
    if (x === undefined || y === undefined) return x === y ? 0 : x === undefined ? 1 : -1 // no value is last in both directions
    const c = x < y ? -1 : x > y ? 1 : 0
    return c * dir || b.updatedAt.localeCompare(a.updatedAt)
  })
}

/** Drop hidden columns and, when asked, sub-issues. Sub-issue progress still counts every child. */
export function visibleIssues(list: IssueSummary[], d: DisplayOptions): IssueSummary[] {
  return d.showSubIssues ? list : list.filter(i => !i.parentId)
}

export function subProgress(parentId: string, all: IssueSummary[]): { done: number; total: number } | null {
  const kids = all.filter(i => i.parentId === parentId)
  return kids.length ? { done: kids.filter(k => CLOSED.includes(k.status)).length, total: kids.length } : null
}

/** What a property looks like on a card, or '' when unset */
export function propText(i: IssueSummary, p: IssueProperty): string {
  const v = propValue(i, p.id)
  if (v === undefined || v === '') return ''
  if (p.type === 'select') return p.options.find(o => o.id === v)?.name ?? ''
  if (p.type === 'checkbox') return v === true ? 'Yes' : ''
  return String(v)
}

// ---- Working state, kept in the URL (ADR 0003) ----

const parseJson = <T>(raw: unknown, fallback: T): T => {
  try { return typeof raw === 'string' && raw ? { ...fallback, ...JSON.parse(raw) } : fallback } catch { return fallback }
}

export function useIssueViewState() {
  const route = useRoute()
  const router = useRouter()
  const filters = ref<IssueFilters>(parseJson(route.query.f, {}))
  const display = ref<DisplayOptions>(parseJson(route.query.d, defaultDisplay()))
  const layoutCookie = useCookie<Layout>('issues-view', { default: () => 'board', maxAge: 60 * 60 * 24 * 365 })
  const layout = computed<Layout>({ get: () => (route.query.l === 'list' || route.query.l === 'board' ? route.query.l : layoutCookie.value), set: (v) => { layoutCookie.value = v; push({ l: v }) } })
  const viewId = ref<string | null>(typeof route.query.view === 'string' ? route.query.view : null)

  function push(extra: Record<string, string | undefined> = {}) {
    const empty = !filterCount(filters.value)
    const isDefaultDisplay = JSON.stringify(display.value) === JSON.stringify(defaultDisplay())
    router.replace({ query: {
      ...route.query,
      f: empty ? undefined : JSON.stringify(filters.value),
      d: isDefaultDisplay ? undefined : JSON.stringify(display.value),
      view: viewId.value ?? undefined,
      ...extra,
    } })
  }
  watch([filters, display, viewId], () => push(), { deep: true })

  function apply(v: IssueViewDef | null) {
    viewId.value = v?.id ?? null
    filters.value = v ? JSON.parse(JSON.stringify(v.filters)) : {}
    display.value = v ? { ...defaultDisplay(), ...JSON.parse(JSON.stringify(v.display)) } : defaultDisplay()
    layout.value = v?.layout ?? layout.value
  }
  return { filters, display, layout, viewId, apply }
}
