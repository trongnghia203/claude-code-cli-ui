<script setup lang="ts">
import type { IssueInput, IssueSummary } from '~/composables/useIssues'
import { ISSUE_PRIORITY_META } from '~/composables/useIssues'
import type { IssueViewDef } from '~/composables/useIssueConfig'
import { propertyColor } from '~/composables/useIssueConfig'
import type { Column, IssueFilters } from '~/composables/useIssueView'
import { DATE_OP_LABEL, columnsFor, defaultDisplay, keysOf, matchesFilters, propText, sortIssues, subProgress, useIssueViewState, visibleIssues } from '~/composables/useIssueView'
import { formatRelativeTime } from '~/utils/messageFormatting'

const { issues, loading, load, create, createWithAgent, update } = useIssues()
const { workingDir } = useWorkingDir()
const { agents, fetchAll: fetchAgents } = useAgents()
const ic = useIssueConfig()
const router = useRouter()
const toast = useToast()

const scope = ref<'project' | 'all'>('project')
const showForm = ref(false)
const query = ref('')
const { filters, display, layout: view, viewId, apply } = useIssueViewState()

const agentOptions = computed(() => agents.value.map(a => ({ slug: a.slug, name: a.frontmatter.name || a.slug })))
const agentName = (slug: string | null) => (slug ? agents.value.find(a => a.slug === slug)?.frontmatter.name ?? slug : 'Unassigned')

const refresh = () => load({ workingDir: workingDir.value, all: scope.value === 'all' || !workingDir.value })
watch([workingDir, scope], refresh)
watch(workingDir, (d) => { if (!d) scope.value = 'all' }, { immediate: true })

// Settings and views of what is on screen: one project's, or the default when several projects are listed
const scopeDir = computed(() => (scope.value === 'project' ? workingDir.value : ''))
const config = computed(() => ic.configFor(scopeDir.value))
const views = computed(() => config.value.views)
watch(scopeDir, d => ic.load(d), { immediate: true })
const labelsOf = (i: IssueSummary) => ic.labelsOf(i.labels, i.projectDir)
const ctx = computed(() => ({ config: config.value, agents: agentOptions.value, all: issues.value }))
const projects = computed(() => [...new Set(issues.value.map(i => i.projectDir))])

// ---- Filter, group, order ----
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return issues.value.filter(i => matchesFilters(i, filters.value, config.value)
    && (!q || i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || labelsOf(i).some(l => l.name.toLowerCase().includes(q))))
})
const visible = computed(() => visibleIssues(filtered.value, display.value))
const allColumns = computed<Column[]>(() => columnsFor(display.value.groupBy, issues.value, ctx.value))
const columns = computed(() => allColumns.value.filter(c => !display.value.hiddenColumns.includes(c.key)))
const cardsIn = (c: Column) => sortIssues(visible.value.filter(i => keysOf(i, display.value.groupBy, config.value).includes(c.key)), display.value, config.value)
const canDrag = computed(() => display.value.groupBy === 'status')
const shows = (k: string) => display.value.card.includes(k)
const customProps = computed(() => config.value.properties.filter(p => !p.archived && shows(`prop:${p.id}`)))
const plain = (md: string) => md.replace(/[#*`>_\[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 160)

// Active filters as removable chips
const chips = computed(() => {
  const f = filters.value
  const out: { key: string; text: string; remove: () => void }[] = []
  const list = (k: 'status' | 'priority' | 'assignee' | 'project' | 'label', title: string, name: (v: string) => string) => {
    if (f[k]?.length) out.push({ key: k, text: `${title}: ${f[k]!.map(name).join(', ')}`, remove: () => { filters.value = { ...f, [k]: undefined } } })
  }
  list('status', 'Status', v => v.replace('_', ' '))
  list('priority', 'Priority', v => ISSUE_PRIORITY_META[v as keyof typeof ISSUE_PRIORITY_META]?.label ?? v)
  list('assignee', 'Assignee', v => (v ? agentName(v) : 'Unassigned'))
  list('project', 'Project', v => v.split('/').filter(Boolean).pop() ?? v)
  list('label', 'Label', v => (v ? config.value.labels.find(l => l.id === v)?.name ?? 'removed' : 'No label'))
  if (f.date) {
    const field = f.date.field === 'createdAt' ? 'Created' : f.date.field === 'updatedAt' ? 'Updated' : config.value.properties.find(p => p.id === f.date!.field)?.name ?? 'removed'
    out.push({ key: 'date', text: `${field}: ${DATE_OP_LABEL[f.date.op]}`, remove: () => { filters.value = { ...f, date: undefined } } })
  }
  for (const [id, want] of Object.entries(f.props ?? {})) {
    const def = config.value.properties.find(p => p.id === id)
    const names = want.map(v => def?.type === 'select' ? (v ? def.options.find(o => o.id === v)?.name ?? 'removed' : `No ${def.name}`) : def?.type === 'checkbox' ? (v === 'true' ? 'Yes' : 'No') : v)
    out.push({ key: `prop:${id}`, text: `${def?.name ?? 'removed property'}: ${names.join(', ')}`, remove: () => { const p = { ...f.props }; delete p[id]; filters.value = { ...f, props: Object.keys(p).length ? p : undefined } } })
  }
  return out
})

// ---- Saved views ----
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b))) : x))
const snapshot = () => ({ layout: view.value, filters: stable(filters.value), display: stable(display.value) })
const activeView = computed(() => views.value.find(v => v.id === viewId.value))
const dirty = computed(() => {
  const v = activeView.value
  if (!v) return false
  const now = snapshot()
  return now.layout !== v.layout || now.filters !== stable(v.filters) || now.display !== stable({ ...defaultDisplay(), ...v.display })
})
// A view that no longer exists (deleted, or from another scope) stops being the active tab but keeps its filters
watch(views, (list) => { if (viewId.value && ic.entries.value[scopeDir.value] && !list.some(v => v.id === viewId.value)) viewId.value = null })

// Saving the first view in a project that follows the default gives the project its own settings
const needsOwnConfig = computed(() => scope.value === 'project' && !!workingDir.value && !ic.entry(workingDir.value).custom)
const askOwn = ref(false)
let pendingSave: (() => Promise<void>) | null = null
async function withOwnConfig(fn: () => Promise<void>) {
  if (!needsOwnConfig.value) return fn()
  pendingSave = fn
  askOwn.value = true
}
async function confirmOwn() {
  askOwn.value = false
  if (await ic.customize(scopeDir.value) && pendingSave) await pendingSave()
  pendingSave = null
}
const body = () => ({ layout: view.value, filters: JSON.parse(JSON.stringify(filters.value)), display: JSON.parse(JSON.stringify(display.value)) })
const uniqueName = (base: string) => {
  const taken = new Set(views.value.map(v => v.name.toLowerCase()))
  let n = base, i = 2
  while (taken.has(n.toLowerCase())) n = `${base} ${i++}`
  return n.slice(0, 40)
}
const createView = (name: string) => withOwnConfig(async () => {
  if (await ic.createView(scopeDir.value, { name, ...body() })) viewId.value = views.value.find(v => v.name === name)?.id ?? null
})
const saveView = () => { if (viewId.value) void withOwnConfig(async () => { await ic.updateView(scopeDir.value, viewId.value!, body()) }) }
const discardView = () => { if (activeView.value) apply(activeView.value) }
const renameView = (id: string, name: string) => ic.updateView(scopeDir.value, id, { name })
const duplicateView = (v: IssueViewDef) => withOwnConfig(async () => { await ic.createView(scopeDir.value, { name: uniqueName(`${v.name} copy`), layout: v.layout, filters: v.filters, display: v.display }) })
const removeView = async (id: string) => { if (await ic.deleteView(scopeDir.value, id) && viewId.value === id) apply(null) }
const moveView = (id: string, dir: -1 | 1) => {
  const ids = views.value.map(v => v.id)
  const i = ids.indexOf(id)
  const j = i + dir
  if (j < 0 || j >= ids.length) return
  ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
  void ic.orderViews(scopeDir.value, ids)
}

const busy = ref(false)
const formKey = ref(0)

async function afterCreate(issue: { id: string } | null, another: boolean) {
  busy.value = false
  if (!issue) return // the composable already toasted the error; the form keeps what was typed
  toast.add({ title: `${issue.id} created`, color: 'success', duration: 2000 })
  if (another) { formKey.value++; refresh(); return } // fresh form, modal stays open
  showForm.value = false
  router.push(`/issues/${issue.id}`)
}
async function onCreate(input: IssueInput, another: boolean) {
  busy.value = true
  await afterCreate(await create(input), another)
}
async function onAgentCreate(prompt: string, another: boolean, draftAgent: string) {
  busy.value = true
  await afterCreate(await createWithAgent(prompt, workingDir.value, agents.value.map(a => ({ slug: a.slug, name: a.frontmatter.name || a.slug, description: a.frontmatter.description || '' })), draftAgent), another)
}

// Drag a card to another column. Only when grouped by status: other groupings would silently set priority or assignee.
const dragId = ref<string | null>(null)
const overKey = ref<string | null>(null)
async function onDrop(status: string) {
  const id = dragId.value
  dragId.value = overKey.value = null
  const issue = issues.value.find(i => i.id === id)
  if (!issue || issue.status === status || !canDrag.value) return
  const prev = issue.status
  issue.status = status as IssueSummary['status'] // optimistic
  if (!(await update(issue.id, { status: status as IssueSummary['status'] }))) issue.status = prev
  await refresh()
}

// Poll while a run is active
let timer: ReturnType<typeof setInterval> | null = null
const anyRunning = computed(() => issues.value.some(i => i.running || i.drafting))
watch(anyRunning, (r) => {
  if (r && !timer) timer = setInterval(refresh, 3000)
  if (!r && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
onMounted(() => { fetchAgents(); refresh() })
// Each project may have its own labels: load the settings of every project on the board
watch(issues, (list) => { for (const d of new Set(list.map(i => i.projectDir))) if (!(d in ic.entries.value)) ic.load(d) })

const open = (i: IssueSummary) => router.push(`/issues/${i.id}`)
const iconBtn = 'p-2 rounded-lg hover-bg'
useHead({ title: 'Issues | Agent Manager' })
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div class="shrink-0 flex items-center gap-3 px-6 py-3" style="border-bottom: 1px solid var(--border-subtle)">
      <h1 class="text-page-title">Issues</h1>
      <div class="flex gap-1 p-1 rounded-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
        <button v-for="s in (['project', 'all'] as const)" :key="s" class="px-2.5 py-1 rounded-md text-[12px] font-medium focus-ring" :disabled="s === 'project' && !workingDir"
          :style="scope === s ? 'background: var(--accent-muted); color: var(--text-primary)' : 'color: var(--text-secondary)'" @click="scope = s">
          {{ s === 'project' ? 'This project' : 'All' }}
        </button>
      </div>
      <input v-model="query" placeholder="Search" class="px-3 py-1.5 rounded-lg text-[12px] w-48" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" />
      <div class="flex-1" />
      <IssueFilterMenu v-model="filters" :config="config" :agents="agentOptions" :projects="projects" :show-project="scope === 'all'" />
      <IssueDisplayMenu v-model="display" :config="config" :columns="allColumns" :show-project="scope === 'all'" />
      <div class="flex gap-1 p-1 rounded-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
        <button class="p-1 rounded-md" title="Board" :style="view === 'board' ? 'background: var(--accent-muted)' : ''" @click="view = 'board'"><UIcon name="i-lucide-columns-3" class="size-4 block" /></button>
        <button class="p-1 rounded-md" title="List" :style="view === 'list' ? 'background: var(--accent-muted)' : ''" @click="view = 'list'"><UIcon name="i-lucide-list" class="size-4 block" /></button>
      </div>
      <NuxtLink to="/issues/settings" :class="iconBtn" title="Issue settings" style="color: var(--text-tertiary)"><UIcon name="i-lucide-settings-2" class="size-4 block" /></NuxtLink>
      <button :class="iconBtn" title="Refresh" style="color: var(--text-tertiary)" @click="refresh"><UIcon name="i-lucide-refresh-cw" class="size-4 block" :class="{ 'animate-spin': loading }" /></button>
      <button class="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50" style="background: var(--accent); color: white" :disabled="!workingDir" :title="workingDir ? '' : 'Select a project first'" @click="showForm = true">
        <UIcon name="i-lucide-plus" class="size-4" /> New issue
      </button>
    </div>

    <div class="shrink-0 px-6 py-2 flex items-center gap-3" style="border-bottom: 1px solid var(--border-subtle)">
      <IssueViewTabs :views="views" :active-id="viewId" :dirty="dirty" @select="apply" @create="createView" @save="saveView" @discard="discardView"
        @rename="renameView" @duplicate="duplicateView" @remove="removeView" @move="moveView" />
    </div>
    <div v-if="chips.length" class="shrink-0 px-6 py-2 flex flex-wrap items-center gap-1.5" style="border-bottom: 1px solid var(--border-subtle)">
      <span v-for="c in chips" :key="c.key" class="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px]" style="background: var(--accent-muted)">{{ c.text }}
        <button class="p-0.5 rounded-full hover-bg" title="Remove filter" @click="c.remove"><UIcon name="i-lucide-x" class="size-3 block" /></button></span>
      <button class="text-[11px] text-meta underline ml-1" @click="filters = {}">Clear</button>
    </div>

    <p v-if="!workingDir" class="px-6 pt-3 text-[12px] text-meta">Select a project to create issues. Agents run in that folder.</p>

    <!-- Board -->
    <div v-if="view === 'board'" class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 flex gap-3">
      <section v-for="c in columns" :key="c.key" class="w-[270px] shrink-0 flex flex-col min-h-0 rounded-xl"
        :style="{ background: 'var(--surface-raised)', border: '1px solid ' + (overKey === c.key && canDrag ? 'var(--accent)' : 'var(--border-subtle)') }"
        @dragover.prevent="canDrag && (overKey = c.key)" @dragleave="overKey === c.key && (overKey = null)" @drop.prevent="onDrop(c.key)">
        <header class="shrink-0 px-3 py-2 flex items-center gap-2 text-[12px] font-semibold">
          <UIcon v-if="c.icon" :name="c.icon" class="size-4" :style="{ color: c.color }" />
          <span v-else-if="c.color" class="size-2.5 rounded-full" :style="{ background: c.color }" />
          {{ c.label }}
          <span class="text-meta font-normal">{{ cardsIn(c).length }}</span>
        </header>
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-2">
          <article v-for="i in cardsIn(c)" :key="i.id" :draggable="canDrag" class="rounded-lg p-2.5 cursor-pointer"
            style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
            @dragstart="dragId = i.id" @dragend="dragId = overKey = null" @click="open(i)">
            <div class="flex items-center gap-3 text-[11px] text-meta font-mono">
              <template v-if="shows('id')">{{ i.id }}</template>
              <span v-if="shows('assignee')" class="flex items-center gap-1 min-w-0 font-sans text-label" :title="agentName(i.assignee)"><UIcon name="i-lucide-cpu" class="size-3 shrink-0" /><span class="truncate">{{ agentName(i.assignee) }}</span></span>
              <UIcon v-if="i.running || i.drafting" name="i-lucide-loader-2" class="size-3 animate-spin" style="color: #3b82f6" :title="i.drafting ? 'Agent is reading sources' : undefined" />
              <span class="ml-auto flex items-center gap-2 shrink-0">
                <span v-if="shows('comments') && i.commentCount" class="flex items-center gap-0.5 font-sans text-label" title="Comments"><UIcon name="i-lucide-message-square" class="size-3" />{{ i.commentCount }}</span>
                <span v-if="shows('priority')" class="size-2 rounded-full" :title="ISSUE_PRIORITY_META[i.priority].label" :style="{ background: ISSUE_PRIORITY_META[i.priority].color }" />
              </span>
            </div>
            <div class="text-[13px] font-medium mt-0.5 line-clamp-2">{{ i.title }}</div>
            <p v-if="shows('description') && i.description.trim()" class="mt-1 text-[11px] text-meta line-clamp-2">{{ plain(i.description) }}</p>
            <div v-if="shows('project') || (shows('subProgress') && subProgress(i.id, issues))" class="mt-1.5 flex items-center gap-2 text-[11px] text-label">
              <span v-if="shows('project')" class="flex items-center gap-0.5 min-w-0"><UIcon name="i-lucide-folder" class="size-3" /><span class="truncate">{{ i.projectDir.split('/').filter(Boolean).pop() }}</span></span>
              <span v-if="shows('subProgress') && subProgress(i.id, issues)" class="flex items-center gap-0.5" title="Closed sub-issues"><UIcon name="i-lucide-git-branch" class="size-3" />{{ subProgress(i.id, issues)!.done }}/{{ subProgress(i.id, issues)!.total }}</span>
            </div>
            <div v-if="customProps.some(p => propText(i, p))" class="mt-1.5 flex flex-wrap gap-1">
              <template v-for="p in customProps" :key="p.id"><span v-if="propText(i, p)" class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" :style="{ border: '1px solid ' + propertyColor(p) + '66' }"><span class="size-1.5 rounded-full" :style="{ background: propertyColor(p) }" /><span class="text-meta">{{ p.name }}</span> {{ propText(i, p) }}</span></template>
            </div>
            <div v-if="shows('labels') && labelsOf(i).length" class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="l in labelsOf(i)" :key="l.id" class="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]" style="background: var(--accent-muted)"><span class="size-1.5 rounded-full" :style="{ background: l.color }" />{{ l.name }}</span>
            </div>
          </article>
        </div>
      </section>
      <p v-if="!columns.length" class="text-[13px] text-meta p-6">All columns are hidden. Show some in Display.</p>
    </div>

    <!-- List -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
      <p v-if="!visible.length && !loading" class="text-[13px] text-meta text-center py-10">{{ issues.length ? 'No issue matches the filters.' : 'No issues yet.' }}</p>
      <section v-for="c in columns" :key="c.key">
        <template v-if="cardsIn(c).length">
          <h2 class="flex items-center gap-2 text-[12px] font-semibold mb-1">
            <UIcon v-if="c.icon" :name="c.icon" class="size-4" :style="{ color: c.color }" /><span v-else-if="c.color" class="size-2.5 rounded-full" :style="{ background: c.color }" />{{ c.label }}
            <span class="text-meta font-normal">{{ cardsIn(c).length }}</span>
          </h2>
          <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle)">
            <button v-for="i in cardsIn(c)" :key="i.id" class="w-full flex items-center gap-3 px-3 py-2 text-left hover-bg text-[13px]" style="border-bottom: 1px solid var(--border-subtle)" @click="open(i)">
              <span v-if="shows('priority')" class="size-2 rounded-full shrink-0" :style="{ background: ISSUE_PRIORITY_META[i.priority].color }" />
              <span v-if="shows('id')" class="font-mono text-[11px] text-meta w-16 shrink-0">{{ i.id }}</span>
              <span class="flex-1 truncate">{{ i.title }}</span>
              <UIcon v-if="i.running || i.drafting" name="i-lucide-loader-2" class="size-3.5 animate-spin" style="color: #3b82f6" :title="i.drafting ? 'Agent is reading sources' : undefined" />
              <span v-if="shows('subProgress') && subProgress(i.id, issues)" class="text-[11px] text-label">{{ subProgress(i.id, issues)!.done }}/{{ subProgress(i.id, issues)!.total }}</span>
              <span v-for="p in customProps.filter(p => propText(i, p))" :key="p.id" class="flex items-center gap-1 text-[11px] text-label"><span class="size-1.5 rounded-full" :style="{ background: propertyColor(p) }" /><span class="text-meta">{{ p.name }}</span> {{ propText(i, p) }}</span>
              <span v-if="shows('assignee')" class="text-[11px] text-label w-32 truncate">{{ agentName(i.assignee) }}</span>
              <span class="text-[11px] text-meta w-20 text-right">{{ formatRelativeTime(i.updatedAt) }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <UModal v-model:open="askOwn">
      <template #content>
        <div class="p-6 space-y-4 w-[440px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Give this project its own settings?</h3>
          <p class="text-[13px] text-label">Views are saved with the project's labels and properties. This project follows the default settings today. Continuing copies them into a file for this project. Later changes to the default will not reach it.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="() => { askOwn = false }" /><UButton label="Continue" size="sm" @click="confirmOwn" /></div>
        </div>
      </template>
    </UModal>

    <UModal v-model:open="showForm" :dismissible="!busy">
      <template #content>
        <IssueForm :key="formKey" :project-dir="workingDir" :agents="agentOptions" :busy="busy" @save="onCreate" @agent-create="onAgentCreate" @cancel="showForm = false" />
      </template>
    </UModal>
  </div>
</template>
