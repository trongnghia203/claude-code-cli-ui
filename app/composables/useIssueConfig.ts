export type PropertyType = 'text' | 'number' | 'select' | 'date' | 'checkbox' | 'url'

export interface IssueLabel { id: string; name: string; color: string; description: string; updatedAt: string }
export interface IssuePropertyOption { id: string; name: string }
export interface IssueProperty { id: string; name: string; type: PropertyType; options: IssuePropertyOption[]; color?: string; archived: boolean; updatedAt: string }
export interface WakeupRule { enabled: boolean; instruction: string }
export interface IssueViewDef { id: string; name: string; layout: 'board' | 'list'; filters: Record<string, any>; display: Record<string, any>; updatedAt: string }
export interface IssueConfig { labels: IssueLabel[]; properties: IssueProperty[]; views: IssueViewDef[]; wakeups: { subIssuesFinish: WakeupRule } }
export interface IssueConfigUsage { labels: Record<string, number>; properties: Record<string, number> }

export const PROPERTY_TYPE_META: Record<PropertyType, { label: string; icon: string }> = {
  text: { label: 'Text', icon: 'i-lucide-type' },
  number: { label: 'Number', icon: 'i-lucide-hash' },
  select: { label: 'Select', icon: 'i-lucide-list' },
  date: { label: 'Date', icon: 'i-lucide-calendar' },
  checkbox: { label: 'Checkbox', icon: 'i-lucide-square-check' },
  url: { label: 'URL', icon: 'i-lucide-link' },
}
export const LABEL_COLORS = ['#6b7280', '#ec4899', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6']
export const MAX_ACTIVE_PROPERTIES = 20
/** Color of a property, gray for ones made before colors existed */
export const propertyColor = (p: { color?: string }) => p.color ?? LABEL_COLORS[0]!

interface ConfigEntry { config: IssueConfig; usage: IssueConfigUsage; custom: boolean }
const EMPTY: ConfigEntry = {
  config: { labels: [], properties: [], views: [], wakeups: { subIssuesFinish: { enabled: true, instruction: '' } } },
  usage: { labels: {}, properties: {} },
  custom: false,
}

/**
 * Issue settings (labels, properties, wakeups). The default lives in ~/.claude/issues/_config.json.
 * A project can have its own file in ~/.config/claude-ui/issues/<project>/. Entries are keyed by project dir, '' is the default.
 */
export function useIssueConfig() {
  const entries = useState<Record<string, ConfigEntry>>('issue-configs', () => ({}))
  const toast = useToast()
  const fail = (e: any) => { toast.add({ title: e?.data?.message || e?.message || 'Request failed', color: 'error', duration: 4000 }); return null }
  const q = (dir: string) => (dir ? `?projectDir=${encodeURIComponent(dir)}` : '')

  /** What a project sees: its own file when it has one, else the default. '' loads the default itself. */
  async function load(dir = '') {
    try {
      entries.value = { ...entries.value, [dir]: await $fetch<ConfigEntry>(`/api/issue-config${q(dir)}`) }
    } catch (e) { fail(e) }
  }
  const entry = (dir = ''): ConfigEntry => entries.value[dir] ?? EMPTY
  const configFor = (dir = '') => entry(dir).config
  /** Run a write, then reload that scope (and the default) so counts stay right. */
  async function write(dir: string, path: string, method: 'POST' | 'PUT' | 'DELETE', body?: unknown): Promise<boolean> {
    try { await $fetch(`${path}${q(dir)}`, { method, body: body as any }) } catch (e) { fail(e); return false }
    await Promise.all([load(dir), ...(dir ? [load('')] : [])])
    return true
  }

  const labelsOf = (ids: string[], dir = '') => ids.map(id => configFor(dir).labels.find(l => l.id === id)).filter((l): l is IssueLabel => !!l)
  const activePropertiesFor = (dir = '') => configFor(dir).properties.filter(p => !p.archived)

  return {
    entries, load, entry, configFor, labelsOf, activePropertiesFor,
    customize: (dir: string) => write(dir, '/api/issue-config/project', 'POST'),
    reset: (dir: string) => write(dir, '/api/issue-config/project', 'DELETE'),
    createLabel: (dir: string, b: { name: string; color: string; description: string }) => write(dir, '/api/issue-config/labels', 'POST', b),
    updateLabel: (dir: string, id: string, b: Partial<{ name: string; color: string; description: string }>) => write(dir, `/api/issue-config/labels/${id}`, 'PUT', b),
    deleteLabel: (dir: string, id: string) => write(dir, `/api/issue-config/labels/${id}`, 'DELETE'),
    createProperty: (dir: string, b: { name: string; type: PropertyType; color: string; options: { id?: string; name: string }[] }) => write(dir, '/api/issue-config/properties', 'POST', b),
    updateProperty: (dir: string, id: string, b: Partial<{ name: string; color: string; options: { id?: string; name: string }[]; archived: boolean }>) => write(dir, `/api/issue-config/properties/${id}`, 'PUT', b),
    createView: (dir: string, b: { name: string; layout: 'board' | 'list'; filters: unknown; display: unknown }) => write(dir, '/api/issue-config/views', 'POST', b),
    updateView: (dir: string, id: string, b: Partial<{ name: string; layout: 'board' | 'list'; filters: unknown; display: unknown }>) => write(dir, `/api/issue-config/views/${id}`, 'PUT', b),
    deleteView: (dir: string, id: string) => write(dir, `/api/issue-config/views/${id}`, 'DELETE'),
    orderViews: (dir: string, ids: string[]) => write(dir, '/api/issue-config/views/order', 'PUT', { ids }),
    saveWakeups: (dir: string, subIssuesFinish: WakeupRule) => write(dir, '/api/issue-config/wakeups', 'PUT', { subIssuesFinish }),
  }
}
