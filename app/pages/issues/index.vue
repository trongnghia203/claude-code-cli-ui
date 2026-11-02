<script setup lang="ts">
import type { IssueInput, IssueSummary } from '~/composables/useIssues'
import { ISSUE_PRIORITY_META } from '~/composables/useIssues'
import type { IssueViewDef } from '~/composables/useIssueConfig'
import { propertyColor } from '~/composables/useIssueConfig'
import type { Column } from '~/composables/useIssueView'
import { columnsFor, filterChips, defaultDisplay, keysOf, matchesFilters, propText, sortIssues, subProgress, useIssueViewState, visibleIssues } from '~/composables/useIssueView'
import { formatRelativeTime } from '~/utils/messageFormatting'
import { formatWakeAt } from '~/utils/wakeupFormat'

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
const chips = computed(() => filterChips(filters.value, config.value, agentName))

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
const createView = (v: { name: string; layout: 'board' | 'list'; filters: unknown; display: unknown }) => withOwnConfig(async () => {
  newViewBusy.value = true
  const ok = await ic.createView(scopeDir.value, v)
  newViewBusy.value = false
  if (!ok) return
  showNewView.value = false
  // Open the new view: the page now shows exactly what was saved
  const created = views.value.find(x => x.name === v.name)
  if (created) apply(created)
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

// Save on the filter bar: update the open view when it changed, else save the filters as a new view
const canSave = computed(() => (activeView.value ? dirty.value : true))
const onSave = () => (activeView.value ? saveView() : openNewView())

// Save as view dialog, prefilled from the page
const showNewView = ref(false)
const newViewKey = ref(0)
const newViewBusy = ref(false)
const openNewView = () => { newViewKey.value++; showNewView.value = true }

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
// A card is tinted while the issue saw a move, comment or other update in the last hour, until you open it
const { markSeen, isUnseen } = useIssueSeen()
const FRESH_MS = 60 * 60_000
const tick = ref(Date.now())
const tickTimer = setInterval(() => { tick.value = Date.now() }, 60_000)
const isFresh = (i: { id: string; updatedAt: string }) => tick.value - Date.parse(i.updatedAt) < FRESH_MS && isUnseen(i.id, i.updatedAt)
const cardStyle = (i: { id: string; updatedAt: string }) => (isFresh(i)
  ? 'background: color-mix(in srgb, #3b82f6 15%, var(--surface-base)); border: 1px solid color-mix(in srgb, #3b82f6 45%, var(--border-subtle))'
  : 'background: var(--surface-base); border: 1px solid var(--border-subtle)')
onUnmounted(() => { if (timer) clearInterval(timer); clearInterval(tickTimer) })
onMounted(() => { fetchAgents(); refresh() })
// Each project may have its own labels: load the settings of every project on the board
watch(issues, (list) => { for (const d of new Set(list.map(i => i.projectDir))) if (!(d in ic.entries.value)) ic.load(d) })

const open = (i: IssueSummary) => { markSeen(i.id); router.push(`/issues/${i.id}`) }
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
      <IssueViewTabs :views="views" :active-id="viewId" :dirty="dirty" @select="apply" @new="openNewView" @save="saveView" @discard="discardView"
        @rename="renameView" @duplicate="duplicateView" @remove="removeView" @move="moveView" />
    </div>
    <div v-if="chips.length" class="shrink-0 px-6 py-2 flex flex-wrap items-center gap-1.5" style="border-bottom: 1px solid var(--border-subtle)">
      <span v-for="c in chips" :key="c.key" class="flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full text-[11px]" style="background: var(--accent-muted)">{{ c.text }}
        <button class="p-0.5 rounded-full hover-bg" title="Remove filter" @click="filters = c.without"><UIcon name="i-lucide-x" class="size-3 block" /></button></span>
      <div class="flex-1" />
      <button class="px-2.5 py-1 rounded-md text-[12px] text-label hover-bg" @click="filters = {}">Clear</button>
      <button v-if="canSave" class="px-2.5 py-1 rounded-md text-[12px] font-medium" style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
        :title="activeView ? `Save the changes to ${activeView.name}` : 'Save these filters as a view'" @click="onSave">{{ activeView ? 'Save' : 'Save as view' }}</button>
    </div>

    <p v-if="!workingDir" class="px-6 pt-3 text-[12px] text-meta">Select a project to create issues. Agents run in that folder.</p>

    <!-- Board -->
    <div v-if="view === 'board'" class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 flex gap-3">
      <section v-for="c in columns" :key="c.key" class="w-[270px] shrink-0 flex flex-col min-h-0 rounded-xl"
        :style="{ background: 'var(--surface-raised)', border: '1px solid ' + (overKey === c.key && canDrag ? 'var(--accent)' : 'var(--border-subtle)') }"
        @dragover.prevent="canDrag && (overKey = c.key)" @dragleave="overKey === c.key && (overKey = null)" @drop.prevent="onDrop(c.key)">
        <header class="shrink-0 px-3 py-2.5 flex items-center gap-2 text-[13px] font-semibold">
          <UIcon v-if="c.icon" :name="c.icon" class="size-4" :style="{ color: c.color }" />
          <span v-else-if="c.color" class="size-2.5 rounded-full" :style="{ background: c.color }" />
          {{ c.label }}
          <span class="text-meta font-normal">{{ cardsIn(c).length }}</span>
        </header>
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-2">
          <article v-for="i in cardsIn(c)" :key="i.id" :draggable="canDrag" class="rounded-lg p-3 cursor-pointer"
            :style="cardStyle(i)" :title="isFresh(i) ? 'Updated since you last opened it' : undefined"
            @dragstart="dragId = i.id" @dragend="dragId = overKey = null" @click="open(i)">
            <div class="flex items-center gap-3 text-[12px] text-meta font-mono">
              <template v-if="shows('id')">{{ i.id }}</template>
              <span v-if="shows('assignee')" class="flex items-center gap-1.5 min-w-0 font-sans text-[12px] text-label" :title="agentName(i.assignee)"><UIcon name="i-lucide-cpu" class="size-3.5 shrink-0" /><span class="truncate">{{ agentName(i.assignee) }}</span></span>
              <UIcon v-if="i.running || i.drafting" name="i-lucide-loader-2" class="size-3 animate-spin" style="color: #3b82f6" :title="i.drafting ? 'Agent is reading sources' : undefined" />
              <span class="ml-auto flex items-center gap-2 shrink-0">
                <span v-if="shows('comments') && i.commentCount" class="flex items-center gap-1 font-sans text-[12px] text-label" title="Comments"><UIcon name="i-lucide-message-square" class="size-3.5" />{{ i.commentCount }}</span>
                <span v-if="shows('priority')" class="size-2.5 rounded-full" :title="ISSUE_PRIORITY_META[i.priority].label" :style="{ background: ISSUE_PRIORITY_META[i.priority].color }" />
              </span>
            </div>
            <div class="text-[14px] leading-snug font-semibold mt-1.5 line-clamp-3" style="color: var(--text-primary)">{{ i.title }}</div>
            <p v-if="shows('description') && i.description.trim()" class="mt-1.5 text-[12px] leading-snug text-label line-clamp-2">{{ plain(i.description) }}</p>
            <div v-if="shows('project') || (shows('subProgress') && subProgress(i.id, issues)) || (shows('wakeup') && i.nextWakeup)" class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-label">
              <span v-if="shows('wakeup') && i.nextWakeup" class="flex items-center gap-1" title="Next wakeup"><UIcon name="i-lucide-clock" class="size-3.5" />{{ formatWakeAt(i.nextWakeup) }}</span>
              <span v-if="shows('project')" class="flex items-center gap-0.5 min-w-0"><UIcon name="i-lucide-folder" class="size-3" /><span class="truncate">{{ i.projectDir.split('/').filter(Boolean).pop() }}</span></span>
              <span v-if="shows('subProgress') && subProgress(i.id, issues)" class="flex items-center gap-0.5" title="Closed sub-issues"><UIcon name="i-lucide-git-branch" class="size-3" />{{ subProgress(i.id, issues)!.done }}/{{ subProgress(i.id, issues)!.total }}</span>
            </div>
            <div v-if="customProps.some(p => propText(i, p))" class="mt-2 flex flex-wrap gap-1.5">
              <template v-for="p in customProps" :key="p.id"><span v-if="propText(i, p)" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px]" :style="{ background: propertyColor(p) + '26', border: '1px solid ' + propertyColor(p) + '55', color: 'var(--text-primary)' }"><span class="font-semibold" :style="{ color: propertyColor(p) }">{{ p.name }}</span><span class="font-medium">{{ propText(i, p) }}</span></span></template>
            </div>
            <div v-if="shows('labels') && labelsOf(i).length" class="mt-2 flex flex-wrap gap-1.5">
              <span v-for="l in labelsOf(i)" :key="l.id" class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[12px]" style="background: var(--accent-muted)"><span class="size-1.5 rounded-full" :style="{ background: l.color }" />{{ l.name }}</span>
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
              <span v-for="p in customProps.filter(p => propText(i, p))" :key="p.id" class="flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px]" :style="{ background: propertyColor(p) + '26', border: '1px solid ' + propertyColor(p) + '55', color: 'var(--text-primary)' }"><span class="font-semibold" :style="{ color: propertyColor(p) }">{{ p.name }}</span><span class="font-medium">{{ propText(i, p) }}</span></span>
              <span v-if="shows('assignee')" class="text-[11px] text-label w-32 truncate">{{ agentName(i.assignee) }}</span>
              <span class="text-[11px] text-meta w-20 text-right">{{ formatRelativeTime(i.updatedAt) }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <UModal v-model:open="showNewView" :dismissible="!newViewBusy">
      <template #content>
        <IssueViewDialog :key="newViewKey" :config="config" :agents="agentOptions" :projects="projects" :show-project="scope === 'all'" :busy="newViewBusy"
          :initial="{ filters, display, layout: view }" :existing-names="views.map(v => v.name)" @create="createView" @cancel="showNewView = false" />
      </template>
    </UModal>

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
