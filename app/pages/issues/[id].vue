<script setup lang="ts">
import type { IssueDetail, IssuePermissionMode, IssuePriority, IssueStatus } from '~/composables/useIssues'
import { ISSUE_PRIORITIES, ISSUE_PRIORITY_META, ISSUE_RUN_META, ISSUE_STATUS_META, ISSUE_STATUSES } from '~/composables/useIssues'
import { renderMarkdown } from '~/utils/markdown'
import { projectSlug } from '~/utils/projectSlug'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { fetchOne, update, remove, comment, run, cancel } = useIssues()
const { agents, fetchAll: fetchAgents } = useAgents()

const id = computed(() => String(route.params.id))
const issue = ref<IssueDetail | null>(null)
const running = ref(false)
const notFound = ref(false)

const editing = ref(false)
const draftTitle = ref('')
const draftDesc = ref('')
const newComment = ref('')
const confirmDelete = ref(false)
const busy = ref(false)

async function load() {
  const res = await fetchOne(id.value)
  if (!res) { if (!issue.value) notFound.value = true; return }
  issue.value = res.issue
  running.value = res.running || res.issue.runs.some(r => r.status === 'running')
}

let timer: ReturnType<typeof setInterval> | null = null
watch(running, (r) => {
  if (r && !timer) timer = setInterval(load, 2500)
  if (!r && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
onMounted(() => { fetchAgents(); load() })

async function patch(input: Parameters<typeof update>[1]) {
  const res = await update(id.value, input)
  if (res) { issue.value = res; running.value = res.runs.some(r => r.status === 'running') }
}
function startEdit() {
  if (!issue.value) return
  draftTitle.value = issue.value.title
  draftDesc.value = issue.value.description
  editing.value = true
}
async function saveEdit() {
  if (!draftTitle.value.trim()) return
  await patch({ title: draftTitle.value, description: draftDesc.value })
  editing.value = false
}
async function send(andRun: boolean) {
  const body = newComment.value.trim()
  if (!body) return
  busy.value = true
  const res = await comment(id.value, body, andRun)
  busy.value = false
  if (res) { issue.value = res; newComment.value = ''; running.value = res.runs.some(r => r.status === 'running') }
}
async function onRun() {
  if (await run(id.value)) { toast.add({ title: 'Run started', color: 'success', duration: 2000 }); await load() }
}
async function onCancel() {
  if (await cancel(id.value)) await load()
}
async function doDelete() {
  confirmDelete.value = false
  if (await remove(id.value)) router.push('/issues')
}

const agentName = (slug: string | null) => (slug ? agents.value.find(a => a.slug === slug)?.frontmatter.name ?? slug : 'Me')
const runById = (runId: string) => issue.value?.runs.find(r => r.id === runId)
const when = (iso?: string) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '')
const duration = (ms?: number) => (ms == null ? '' : Math.round(ms / 1000) < 60 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60000)}m ${Math.round(ms / 1000) % 60}s`)
const sessionLink = (sid?: string) => (sid && issue.value ? `/cli/project/${encodeURIComponent(projectSlug(issue.value.projectDir))}/session/${encodeURIComponent(sid)}` : null)
const canRun = computed(() => !!issue.value?.assignee && !running.value && issue.value.status !== 'done' && issue.value.status !== 'cancelled')

useHead({ title: computed(() => `${id.value} | Agent Manager`) })
</script>

<template>
  <div class="h-full flex min-h-0">
    <div v-if="notFound" class="p-10 text-[13px] text-label">Issue not found. <NuxtLink to="/issues" class="underline">Back to issues</NuxtLink></div>
    <template v-else-if="issue">
      <!-- Main -->
      <div class="flex-1 min-w-0 overflow-y-auto custom-scrollbar p-6 space-y-6">
        <NuxtLink to="/issues" class="inline-flex items-center gap-1 text-[12px] text-label"><UIcon name="i-lucide-arrow-left" class="size-3.5" /> Issues</NuxtLink>

        <section class="space-y-3">
          <div class="text-[11px] font-mono text-meta">{{ issue.id }}<template v-if="issue.parentId"> &middot; sub-issue of <NuxtLink :to="`/issues/${issue.parentId}`" class="underline">{{ issue.parentId }}</NuxtLink></template></div>
          <template v-if="editing">
            <input v-model="draftTitle" class="w-full px-3 py-2 rounded-lg text-[18px] font-semibold" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" />
            <textarea v-model="draftDesc" rows="10" class="w-full px-3 py-2 rounded-lg text-[13px] font-mono" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" />
            <div class="flex gap-2"><UButton label="Save" size="sm" @click="saveEdit" /><UButton label="Cancel" size="sm" variant="ghost" color="neutral" @click="editing = false" /></div>
          </template>
          <template v-else>
            <div class="flex items-start gap-3">
              <h1 class="text-[20px] font-semibold flex-1">{{ issue.title }}</h1>
              <button class="p-1.5 rounded-lg hover-bg" title="Edit" style="color: var(--text-tertiary)" @click="startEdit"><UIcon name="i-lucide-pencil" class="size-4 block" /></button>
            </div>
            <div v-if="issue.description.trim()" class="prose-sm text-[13px]" v-html="renderMarkdown(issue.description)" />
            <p v-else class="text-[13px] text-meta">No description.</p>
          </template>
        </section>

        <section class="space-y-3">
          <h2 class="text-[13px] font-semibold">Activity</h2>
          <ol class="space-y-3">
            <li v-for="e in issue.timeline" :key="e.id">
              <!-- comment -->
              <div v-if="e.type === 'comment'" class="rounded-xl p-3" :style="{ background: 'var(--surface-raised)', border: '1px solid var(--border-subtle)' }">
                <div class="flex items-center gap-2 text-[11px] text-label mb-1">
                  <UIcon :name="e.author === 'agent' ? 'i-lucide-cpu' : 'i-lucide-user'" class="size-3.5" />
                  {{ e.author === 'agent' ? agentName(issue.assignee) : 'You' }} &middot; {{ when(e.at) }}
                </div>
                <div class="text-[13px] prose-sm" v-html="renderMarkdown(e.body)" />
              </div>
              <!-- status -->
              <div v-else-if="e.type === 'status'" class="flex items-center gap-2 text-[12px] text-label">
                <UIcon :name="ISSUE_STATUS_META[e.to].icon" class="size-3.5" :style="{ color: ISSUE_STATUS_META[e.to].color }" />
                <span>{{ e.by === 'system' ? 'System' : 'You' }} {{ e.from ? 'moved' : 'set' }} status<template v-if="e.from"> from {{ ISSUE_STATUS_META[e.from].label }}</template> to <b>{{ ISSUE_STATUS_META[e.to].label }}</b></span>
                <span class="text-meta">{{ when(e.at) }}</span>
              </div>
              <!-- assign -->
              <div v-else-if="e.type === 'assign'" class="flex items-center gap-2 text-[12px] text-label">
                <UIcon name="i-lucide-user-round-check" class="size-3.5" />
                <span>Assigned to <b>{{ agentName(e.to) }}</b></span><span class="text-meta">{{ when(e.at) }}</span>
              </div>
              <!-- run -->
              <div v-else-if="e.type === 'run' && runById(e.runId)" class="rounded-xl p-3 text-[12px]" style="border: 1px dashed var(--border-subtle)">
                <div class="flex items-center gap-2">
                  <UIcon :name="ISSUE_RUN_META[runById(e.runId)!.status].icon" class="size-4" :class="{ 'animate-spin': runById(e.runId)!.status === 'running' }" :style="{ color: ISSUE_RUN_META[runById(e.runId)!.status].color }" />
                  <b>Run {{ ISSUE_RUN_META[runById(e.runId)!.status].label.toLowerCase() }}</b>
                  <span class="text-label">{{ agentName(runById(e.runId)!.agent) }} &middot; {{ when(e.at) }}</span>
                  <span class="ml-auto text-meta">
                    {{ duration(runById(e.runId)!.durationMs) }}<template v-if="runById(e.runId)!.costUsd != null"> &middot; ${{ runById(e.runId)!.costUsd!.toFixed(2) }}</template><template v-if="runById(e.runId)!.numTurns"> &middot; {{ runById(e.runId)!.numTurns }} turns</template>
                  </span>
                </div>
                <p v-if="runById(e.runId)!.error" class="mt-1.5" style="color: #ef4444">{{ runById(e.runId)!.error }}</p>
                <p v-if="runById(e.runId)!.permissionDenials?.length" class="mt-1.5" style="color: #d97706">Denied tools: {{ [...new Set(runById(e.runId)!.permissionDenials)].join(', ') }}</p>
                <NuxtLink v-if="sessionLink(runById(e.runId)!.sessionId)" :to="sessionLink(runById(e.runId)!.sessionId)!" class="inline-block mt-1.5 underline text-label">Open chat session</NuxtLink>
              </div>
            </li>
          </ol>

          <div class="rounded-xl p-3 space-y-2" style="background: var(--surface-raised); border: 1px solid var(--border-subtle)">
            <textarea v-model="newComment" rows="3" placeholder="Leave a comment" class="w-full px-2 py-1.5 rounded-lg text-[13px]" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" />
            <div class="flex justify-end gap-2">
              <UButton label="Comment" size="sm" variant="soft" color="neutral" :disabled="!newComment.trim() || busy" @click="send(false)" />
              <UButton label="Comment and run" size="sm" icon="i-lucide-play" :disabled="!newComment.trim() || busy || running || !issue.assignee" :title="issue.assignee ? '' : 'Assign an agent first'" @click="send(true)" />
            </div>
          </div>
        </section>
      </div>

      <!-- Sidebar -->
      <aside class="w-[290px] shrink-0 overflow-y-auto custom-scrollbar p-4 space-y-4 text-[12px]" style="border-left: 1px solid var(--border-subtle)">
        <div class="flex gap-2">
          <UButton v-if="running" label="Stop run" icon="i-lucide-square" color="error" variant="soft" size="sm" class="flex-1 justify-center" @click="onCancel" />
          <UButton v-else label="Run agent" icon="i-lucide-play" size="sm" class="flex-1 justify-center" :disabled="!canRun" @click="onRun" />
        </div>
        <label class="block space-y-1"><span class="text-label">Status</span>
          <select :value="issue.status" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @change="patch({ status: ($event.target as HTMLSelectElement).value as IssueStatus })">
            <option v-for="s in ISSUE_STATUSES" :key="s" :value="s">{{ ISSUE_STATUS_META[s].label }}</option>
          </select></label>
        <label class="block space-y-1"><span class="text-label">Priority</span>
          <select :value="issue.priority" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @change="patch({ priority: ($event.target as HTMLSelectElement).value as IssuePriority })">
            <option v-for="p in ISSUE_PRIORITIES" :key="p" :value="p">{{ ISSUE_PRIORITY_META[p].label }}</option>
          </select></label>
        <label class="block space-y-1"><span class="text-label">Assignee</span>
          <select :value="issue.assignee ?? ''" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @change="patch({ assignee: ($event.target as HTMLSelectElement).value || null })">
            <option value="">Me (no agent run)</option>
            <option v-for="a in agents" :key="a.slug" :value="a.slug">{{ a.frontmatter.name || a.slug }}</option>
          </select></label>
        <label class="block space-y-1"><span class="text-label">Agent permissions</span>
          <select :value="issue.permissionMode" class="w-full px-2 py-1.5 rounded-lg" style="background: var(--surface-base); border: 1px solid var(--border-subtle)" @change="patch({ permissionMode: ($event.target as HTMLSelectElement).value as IssuePermissionMode })">
            <option value="plan">Plan only (no edits)</option>
            <option value="default">Default</option>
            <option value="acceptEdits">Accept edits</option>
          </select></label>
        <div v-if="issue.labels.length" class="space-y-1"><span class="text-label">Labels</span>
          <div class="flex flex-wrap gap-1"><span v-for="l in issue.labels" :key="l" class="px-1.5 py-0.5 rounded text-[11px]" style="background: var(--accent-muted)">{{ l }}</span></div></div>
        <div class="space-y-1"><span class="text-label">Project</span><p class="font-mono text-[11px] text-meta break-all">{{ issue.projectDir }}</p></div>
        <div class="space-y-1"><span class="text-label">Runs ({{ issue.runs.length }})</span>
          <p v-if="!issue.runs.length" class="text-meta">None yet.</p>
          <ul class="space-y-1"><li v-for="r in [...issue.runs].reverse()" :key="r.id" class="flex items-center gap-1.5">
            <UIcon :name="ISSUE_RUN_META[r.status].icon" class="size-3.5" :class="{ 'animate-spin': r.status === 'running' }" :style="{ color: ISSUE_RUN_META[r.status].color }" />
            {{ ISSUE_RUN_META[r.status].label }} <span class="text-meta ml-auto">{{ when(r.startedAt) }}</span></li></ul></div>
        <button class="flex items-center gap-1.5 text-[12px]" style="color: #ef4444" @click="confirmDelete = true"><UIcon name="i-lucide-trash-2" class="size-3.5" /> Delete issue</button>
      </aside>
    </template>

    <UModal v-model:open="confirmDelete">
      <template #content>
        <div class="p-6 space-y-4 w-[420px] max-w-full" style="background: var(--surface-raised)">
          <h3 class="text-page-title">Delete {{ id }}?</h3>
          <p class="text-[13px] text-label">This removes the issue and its history for good and stops an active run. To keep the record, set the status to Cancelled instead.</p>
          <div class="flex justify-end gap-2"><UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="confirmDelete = false" /><UButton label="Delete" color="error" size="sm" @click="doDelete" /></div>
        </div>
      </template>
    </UModal>
  </div>
</template>
