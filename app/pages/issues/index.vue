<script setup lang="ts">
import type { IssueInput, IssueStatus, IssueSummary } from '~/composables/useIssues'
import { ISSUE_PRIORITY_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'
import { formatRelativeTime } from '~/utils/messageFormatting'

const { issues, loading, load, create, createWithAgent, update } = useIssues()
const { workingDir } = useWorkingDir()
const { agents, fetchAll: fetchAgents } = useAgents()
const router = useRouter()
const toast = useToast()

const scope = ref<'project' | 'all'>('project')
const view = useCookie<'board' | 'list'>('issues-view', { default: () => 'board', maxAge: 60 * 60 * 24 * 365 })
const showForm = ref(false)
const query = ref('')

const agentOptions = computed(() => agents.value.map(a => ({ slug: a.slug, name: a.frontmatter.name || a.slug })))
const agentName = (slug: string | null) => (slug ? agents.value.find(a => a.slug === slug)?.frontmatter.name ?? slug : 'Unassigned')

const refresh = () => load({ workingDir: workingDir.value, all: scope.value === 'all' || !workingDir.value })
watch([workingDir, scope], refresh)
watch(workingDir, (d) => { if (!d) scope.value = 'all' }, { immediate: true })

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  return issues.value.filter(i => !q || i.title.toLowerCase().includes(q) || i.id.toLowerCase().includes(q) || i.labels.some(l => l.toLowerCase().includes(q)))
})
const byStatus = (s: IssueStatus) => filtered.value
  .filter(i => i.status === s)
  .sort((a, b) => ISSUE_PRIORITY_META[a.priority].rank - ISSUE_PRIORITY_META[b.priority].rank || b.updatedAt.localeCompare(a.updatedAt))

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
async function onAgentCreate(prompt: string, another: boolean) {
  busy.value = true
  await afterCreate(await createWithAgent(prompt, workingDir.value, agents.value.map(a => ({ slug: a.slug, name: a.frontmatter.name || a.slug, description: a.frontmatter.description || '' }))), another)
}

// Drag a card to another column
const dragId = ref<string | null>(null)
const overStatus = ref<IssueStatus | null>(null)
async function onDrop(status: IssueStatus) {
  const id = dragId.value
  dragId.value = overStatus.value = null
  const issue = issues.value.find(i => i.id === id)
  if (!issue || issue.status === status) return
  const prev = issue.status
  issue.status = status // optimistic
  if (!(await update(issue.id, { status }))) issue.status = prev
  await refresh()
}

// Poll while a run is active
let timer: ReturnType<typeof setInterval> | null = null
const anyRunning = computed(() => issues.value.some(i => i.running))
watch(anyRunning, (r) => {
  if (r && !timer) timer = setInterval(refresh, 3000)
  if (!r && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
onMounted(() => { fetchAgents(); refresh() })

const open = (i: IssueSummary) => router.push(`/issues/${i.id}`)
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
      <input v-model="query" placeholder="Filter" class="px-3 py-1.5 rounded-lg text-[12px] w-48" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)" />
      <div class="flex-1" />
      <div class="flex gap-1 p-1 rounded-lg" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
        <button class="p-1 rounded-md" title="Board" :style="view === 'board' ? 'background: var(--accent-muted)' : ''" @click="view = 'board'"><UIcon name="i-lucide-columns-3" class="size-4 block" /></button>
        <button class="p-1 rounded-md" title="List" :style="view === 'list' ? 'background: var(--accent-muted)' : ''" @click="view = 'list'"><UIcon name="i-lucide-list" class="size-4 block" /></button>
      </div>
      <button class="p-2 rounded-lg hover-bg" title="Refresh" style="color: var(--text-tertiary)" @click="refresh"><UIcon name="i-lucide-refresh-cw" class="size-4 block" :class="{ 'animate-spin': loading }" /></button>
      <button class="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50" style="background: var(--accent); color: white" :disabled="!workingDir" :title="workingDir ? '' : 'Select a project first'" @click="showForm = true">
        <UIcon name="i-lucide-plus" class="size-4" /> New issue
      </button>
    </div>

    <p v-if="!workingDir" class="px-6 pt-3 text-[12px] text-meta">Select a project to create issues. Agents run in that folder.</p>

    <!-- Board -->
    <div v-if="view === 'board'" class="flex-1 min-h-0 overflow-x-auto overflow-y-hidden p-4 flex gap-3">
      <section v-for="s in ISSUE_STATUSES" :key="s" class="w-[270px] shrink-0 flex flex-col min-h-0 rounded-xl"
        :style="{ background: 'var(--surface-raised)', border: '1px solid ' + (overStatus === s ? 'var(--accent)' : 'var(--border-subtle)') }"
        @dragover.prevent="overStatus = s" @dragleave="overStatus === s && (overStatus = null)" @drop.prevent="onDrop(s)">
        <header class="shrink-0 px-3 py-2 flex items-center gap-2 text-[12px] font-semibold">
          <UIcon :name="ISSUE_STATUS_META[s].icon" class="size-4" :style="{ color: ISSUE_STATUS_META[s].color }" />
          {{ ISSUE_STATUS_META[s].label }}
          <span class="text-meta font-normal">{{ byStatus(s).length }}</span>
        </header>
        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-2 pb-2 space-y-2">
          <article v-for="i in byStatus(s)" :key="i.id" draggable="true" class="rounded-lg p-2.5 cursor-pointer"
            style="background: var(--surface-base); border: 1px solid var(--border-subtle)"
            @dragstart="dragId = i.id" @dragend="dragId = overStatus = null" @click="open(i)">
            <div class="flex items-center gap-1.5 text-[11px] text-meta font-mono">
              {{ i.id }}
              <UIcon v-if="i.running" name="i-lucide-loader-2" class="size-3 animate-spin" style="color: #3b82f6" />
              <span class="ml-auto size-2 rounded-full" :title="ISSUE_PRIORITY_META[i.priority].label" :style="{ background: ISSUE_PRIORITY_META[i.priority].color }" />
            </div>
            <div class="text-[13px] font-medium mt-0.5 line-clamp-2">{{ i.title }}</div>
            <div class="mt-1.5 flex items-center gap-2 text-[11px] text-label">
              <UIcon name="i-lucide-cpu" class="size-3" /><span class="truncate">{{ agentName(i.assignee) }}</span>
              <span v-if="i.commentCount" class="ml-auto flex items-center gap-0.5"><UIcon name="i-lucide-message-square" class="size-3" />{{ i.commentCount }}</span>
            </div>
            <div v-if="i.labels.length" class="mt-1.5 flex flex-wrap gap-1">
              <span v-for="l in i.labels" :key="l" class="px-1.5 py-0.5 rounded text-[10px]" style="background: var(--accent-muted)">{{ l }}</span>
            </div>
          </article>
        </div>
      </section>
    </div>

    <!-- List -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
      <p v-if="!filtered.length && !loading" class="text-[13px] text-meta text-center py-10">No issues yet.</p>
      <section v-for="s in ISSUE_STATUSES" :key="s">
        <template v-if="byStatus(s).length">
          <h2 class="flex items-center gap-2 text-[12px] font-semibold mb-1">
            <UIcon :name="ISSUE_STATUS_META[s].icon" class="size-4" :style="{ color: ISSUE_STATUS_META[s].color }" />{{ ISSUE_STATUS_META[s].label }}
            <span class="text-meta font-normal">{{ byStatus(s).length }}</span>
          </h2>
          <div class="rounded-xl overflow-hidden" style="border: 1px solid var(--border-subtle)">
            <button v-for="i in byStatus(s)" :key="i.id" class="w-full flex items-center gap-3 px-3 py-2 text-left hover-bg text-[13px]" style="border-bottom: 1px solid var(--border-subtle)" @click="open(i)">
              <span class="size-2 rounded-full shrink-0" :style="{ background: ISSUE_PRIORITY_META[i.priority].color }" />
              <span class="font-mono text-[11px] text-meta w-16 shrink-0">{{ i.id }}</span>
              <span class="flex-1 truncate">{{ i.title }}</span>
              <UIcon v-if="i.running" name="i-lucide-loader-2" class="size-3.5 animate-spin" style="color: #3b82f6" />
              <span class="text-[11px] text-label w-32 truncate">{{ agentName(i.assignee) }}</span>
              <span class="text-[11px] text-meta w-20 text-right">{{ formatRelativeTime(i.updatedAt) }}</span>
            </button>
          </div>
        </template>
      </section>
    </div>

    <UModal v-model:open="showForm" :dismissible="!busy">
      <template #content>
        <IssueForm :key="formKey" :project-dir="workingDir" :agents="agentOptions" :busy="busy" @save="onCreate" @agent-create="onAgentCreate" @cancel="showForm = false" />
      </template>
    </UModal>
  </div>
</template>
