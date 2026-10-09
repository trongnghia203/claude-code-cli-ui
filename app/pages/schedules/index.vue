<script setup lang="ts">
import { formatRelativeTime } from '~/utils/messageFormatting'
import type { RunStatus, ScheduleInput, ScheduleItem, ScheduleRunItem } from '~/composables/useSchedules'

const { jobs, supported, loading, load, save, setEnabled, remove, runNow, fetchRuns } = useSchedules()
const { workingDir } = useWorkingDir()
const { agents, fetchAll: fetchAgents } = useAgents()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// Selection lives in the URL (?job=<id>&run=<runId>) so a refresh or a shared link lands on the same view
const selectedJobId = computed(() => (typeof route.query.job === 'string' ? route.query.job : null))
const selectedRunId = computed(() => (typeof route.query.run === 'string' ? route.query.run : null))
const selectedJob = computed(() => jobs.value.find(j => j.id === selectedJobId.value) ?? null)

function select(jobId: string | null, runId: string | null = null) {
  router.push({ path: '/schedules', query: { ...(jobId ? { job: jobId } : {}), ...(runId ? { run: runId } : {}) } })
}

const runs = ref<ScheduleRunItem[]>([])
async function loadRuns() {
  runs.value = selectedJob.value ? await fetchRuns(selectedJob.value) : []
}
watch(selectedJobId, loadRuns)

const editing = ref<ScheduleItem | null>(null)
const showEditor = ref(false)
const confirmDelete = ref<ScheduleItem | null>(null)

function newJob() {
  editing.value = null
  showEditor.value = true
}
function editJob(job: ScheduleItem) {
  editing.value = job
  showEditor.value = true
}
async function onSave(input: ScheduleInput) {
  const wasEditing = editing.value
  if (await save(input, wasEditing?.id)) {
    showEditor.value = false
    toast.add({ title: wasEditing ? 'Schedule updated' : 'Schedule created', color: 'success', duration: 2000 })
    await loadRuns()
  }
}
async function doDelete() {
  const job = confirmDelete.value
  if (!job) return
  confirmDelete.value = null
  await remove(job)
  if (selectedJobId.value === job.id) select(null)
}

async function onRunNow(job: ScheduleItem) {
  const runId = await runNow(job)
  if (!runId) return
  toast.add({ title: 'Run started', description: job.name, color: 'success', duration: 2000 })
  await refresh()
  select(job.id, runId)
}

async function refresh() {
  await load()
  await loadRuns()
}

// Poll while something is running so statuses update without a reload
let timer: ReturnType<typeof setInterval> | null = null
const anyRunning = computed(() => jobs.value.some(j => j.lastRun?.status === 'running') || runs.value.some(r => r.status === 'running'))
watch(anyRunning, (running) => {
  if (running && !timer) timer = setInterval(refresh, 3000)
  if (!running && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })
onMounted(async () => {
  fetchAgents()
  await load()
  await loadRuns()
})

const agentName = (slug: string | null) => (slug ? agents.value.find(a => a.slug === slug)?.frontmatter.name ?? slug : null)

const STATUS: Record<RunStatus, { label: string; color: string; icon: string }> = {
  running: { label: 'Running', color: '#3b82f6', icon: 'i-lucide-loader-2' },
  success: { label: 'Success', color: '#22c55e', icon: 'i-lucide-check-circle-2' },
  error: { label: 'Failed', color: '#ef4444', icon: 'i-lucide-x-circle' },
  timeout: { label: 'Timed out', color: '#d97706', icon: 'i-lucide-timer-off' },
}

function when(iso?: string | null) {
  if (!iso) return ''
  return new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function duration(ms?: number) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const cost = (usd?: number) => (usd == null ? '' : `$${usd.toFixed(2)}`)

useHead({ title: 'Schedules | Agent Manager' })
</script>

<template>
  <div class="h-full flex min-h-0">
    <!-- Left column: schedules and their runs -->
    <aside class="w-[340px] shrink-0 flex flex-col min-h-0" style="border-right: 1px solid var(--border-subtle)">
      <div class="shrink-0 px-4 min-h-[56px] flex items-center justify-between" style="border-bottom: 1px solid var(--border-subtle)">
        <h1 class="text-[14px] font-semibold flex items-center gap-2">
          Schedules <span class="font-mono text-[11px] font-normal text-meta">{{ jobs.length }}</span>
        </h1>
        <button class="p-1.5 rounded-lg hover-bg flex items-center justify-center" title="Refresh" style="color: var(--text-tertiary)" @click="refresh">
          <UIcon name="i-lucide-refresh-cw" class="size-3.5 block" :class="{ 'animate-spin': loading }" />
        </button>
      </div>

      <div class="shrink-0 p-3">
        <button
          class="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-[13px] font-semibold disabled:opacity-50"
          style="background: var(--accent); color: white;"
          :disabled="!supported"
          @click="newJob"
        >
          <UIcon name="i-lucide-plus" class="size-4" /> New Schedule
        </button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-3 pb-3 space-y-2">
        <p v-if="!supported" class="text-[12px] px-1" style="color: #d97706;">Scheduled runs need macOS (launchd).</p>
        <p v-else-if="!jobs.length && !loading" class="text-[12px] text-meta px-1 py-6 text-center">No schedules yet. Create one to run a prompt or an agent on a timer.</p>

        <div v-for="job in jobs" :key="job.id">
          <div
            class="group rounded-xl p-3 cursor-pointer transition-colors"
            :style="{
              background: selectedJobId === job.id ? 'var(--accent-muted)' : 'var(--surface-raised)',
              border: '1px solid ' + (selectedJobId === job.id ? 'rgba(229,169,62,0.25)' : 'var(--border-subtle)'),
            }"
            @click="select(job.id)"
          >
            <div class="flex items-start gap-2">
              <div class="min-w-0 flex-1">
                <div class="text-[13px] font-medium truncate" :class="{ 'opacity-60': !job.enabled }">{{ job.name }}</div>
                <div class="text-[11px] text-label truncate">
                  {{ job.scheduleText }}<template v-if="job.enabled && job.nextRun"> &middot; next {{ when(job.nextRun) }}</template><template v-else-if="!job.enabled"> &middot; paused</template>
                </div>
              </div>
              <label class="field-toggle scale-90 shrink-0" :title="job.enabled ? 'Pause' : 'Enable'" @click.stop>
                <input type="checkbox" :checked="job.enabled" @change="setEnabled(job, ($event.target as HTMLInputElement).checked)" />
                <span class="field-toggle__track"><span class="field-toggle__thumb" /></span>
              </label>
            </div>
            <div class="mt-1.5 flex items-center gap-2 text-[11px]">
              <span v-if="job.lastRun" class="flex items-center gap-1" :style="{ color: STATUS[job.lastRun.status].color }">
                <UIcon :name="STATUS[job.lastRun.status].icon" class="size-3.5" :class="{ 'animate-spin': job.lastRun.status === 'running' }" />
                {{ STATUS[job.lastRun.status].label }}
                <span class="text-meta">{{ formatRelativeTime(job.lastRun.startedAt) }}</span>
              </span>
              <span v-else class="text-meta">Never run</span>
              <span v-if="job.enabled && !job.registered" class="px-1.5 rounded-full" style="background: rgba(239,68,68,0.1); color: #ef4444;" title="Enabled but not registered with launchd. Save it again to register.">not registered</span>
            </div>
          </div>

          <!-- Runs of the selected schedule -->
          <div v-if="selectedJobId === job.id" class="mt-1 ml-3 pl-2 space-y-0.5" style="border-left: 2px solid var(--border-subtle)">
            <p v-if="!runs.length" class="text-[11px] text-meta px-2 py-2">No runs yet. Use Run now.</p>
            <button
              v-for="run in runs"
              :key="run.id"
              class="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left hover-bg"
              :style="selectedRunId === run.id ? 'background: var(--accent-muted);' : ''"
              @click="select(job.id, run.id)"
            >
              <UIcon :name="STATUS[run.status].icon" class="size-3.5 shrink-0" :class="{ 'animate-spin': run.status === 'running' }" :style="{ color: STATUS[run.status].color }" />
              <span class="text-[12px] flex-1 truncate">{{ when(run.startedAt) }}<span v-if="run.trigger === 'manual'" class="text-meta"> &middot; manual</span></span>
              <span class="text-[10px] font-mono text-meta shrink-0">{{ [duration(run.durationMs), cost(run.costUsd)].filter(Boolean).join(' · ') }}</span>
            </button>
          </div>
        </div>
      </div>
    </aside>

    <!-- Right panel -->
    <section class="flex-1 min-w-0 min-h-0">
      <ScheduleRunPanel
        v-if="selectedJob && selectedRunId"
        :key="selectedRunId"
        :job="selectedJob"
        :run-id="selectedRunId"
        @back="select(selectedJob.id)"
        @changed="refresh"
      />

      <!-- Schedule summary -->
      <div v-else-if="selectedJob" class="h-full flex flex-col min-h-0">
        <div class="shrink-0 px-6 min-h-[56px] py-2 flex items-center gap-3" style="border-bottom: 1px solid var(--border-subtle)">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-[15px] font-semibold truncate">{{ selectedJob.name }}</h2>
              <span v-if="agentName(selectedJob.agent)" class="text-[10px] font-mono px-1.5 py-px rounded-full badge badge-agent">agent: {{ agentName(selectedJob.agent) }}</span>
              <span v-if="selectedJob.permissionMode === 'plan'" class="text-[10px] px-1.5 py-px rounded-full badge badge-subtle">read-only</span>
              <span v-else-if="selectedJob.permissionMode === 'acceptEdits'" class="text-[10px] px-1.5 py-px rounded-full" style="background: rgba(217,119,6,0.12); color: #d97706;">can edit files</span>
            </div>
            <p class="text-[11px] font-mono text-meta truncate">{{ selectedJob.workingDir }}</p>
          </div>
          <UButton size="sm" variant="soft" icon="i-lucide-play" label="Run now" :disabled="selectedJob.lastRun?.status === 'running'" @click="onRunNow(selectedJob)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-pencil" label="Edit" @click="editJob(selectedJob)" />
          <UButton size="sm" variant="ghost" color="neutral" icon="i-lucide-trash-2" aria-label="Delete" @click="confirmDelete = selectedJob" />
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-5 max-w-4xl">
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="rounded-xl bg-card p-3" style="border: 1px solid var(--border-subtle)">
              <div class="text-[10px] uppercase tracking-wider text-meta">Schedule</div>
              <div class="text-[13px] mt-1">{{ selectedJob.scheduleText }}</div>
            </div>
            <div class="rounded-xl bg-card p-3" style="border: 1px solid var(--border-subtle)">
              <div class="text-[10px] uppercase tracking-wider text-meta">Next run</div>
              <div class="text-[13px] mt-1">{{ selectedJob.enabled && selectedJob.nextRun ? when(selectedJob.nextRun) : 'Paused' }}</div>
            </div>
            <div class="rounded-xl bg-card p-3" style="border: 1px solid var(--border-subtle)">
              <div class="text-[10px] uppercase tracking-wider text-meta">Budget</div>
              <div class="text-[13px] mt-1">${{ selectedJob.maxBudgetUsd }} per run</div>
            </div>
            <div class="rounded-xl bg-card p-3" style="border: 1px solid var(--border-subtle)">
              <div class="text-[10px] uppercase tracking-wider text-meta">Timeout</div>
              <div class="text-[13px] mt-1">{{ selectedJob.timeoutMinutes }} min</div>
            </div>
          </div>

          <div>
            <div class="text-[11px] font-semibold uppercase tracking-wider text-meta mb-1.5">Prompt</div>
            <div class="rounded-xl bg-card p-4 text-[13px] whitespace-pre-wrap leading-relaxed" style="border: 1px solid var(--border-subtle)">{{ selectedJob.prompt }}</div>
          </div>

          <div v-if="selectedJob.allowedTools.length" class="space-y-1.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-meta">Allowed tools</div>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="t in selectedJob.allowedTools" :key="t" class="text-[11px] font-mono px-2 py-0.5 rounded-full" style="background: var(--surface-raised); border: 1px solid var(--border-subtle); color: var(--text-secondary);">{{ t }}</span>
            </div>
          </div>
          <div v-if="selectedJob.disallowedTools.length" class="space-y-1.5">
            <div class="text-[11px] font-semibold uppercase tracking-wider text-meta">Denied tools</div>
            <div class="flex flex-wrap gap-1.5">
              <span v-for="t in selectedJob.disallowedTools" :key="t" class="text-[11px] font-mono px-2 py-0.5 rounded-full" style="background: rgba(239,68,68,0.06); border: 1px solid rgba(239,68,68,0.2); color: #ef4444;">{{ t }}</span>
            </div>
          </div>

          <p class="text-[12px] text-meta">Pick a run on the left to read its output.</p>
        </div>
      </div>

      <!-- Nothing selected -->
      <div v-else class="h-full flex flex-col items-center justify-center text-center px-8 gap-2">
        <div class="size-16 rounded-2xl flex items-center justify-center mb-2" style="background: var(--accent-muted)">
          <UIcon name="i-lucide-clock" class="size-8" style="color: var(--accent)" />
        </div>
        <h2 class="text-[16px] font-semibold">Schedules</h2>
        <p class="text-[13px] text-label max-w-md leading-relaxed">
          Run Claude on a timer, even when this app is closed. Each run starts <code class="font-mono text-[12px]">claude -p</code> in a project folder,
          optionally as one of your agents, and keeps its output here.
        </p>
        <UButton v-if="supported" label="New Schedule" icon="i-lucide-plus" size="sm" class="mt-3" @click="newJob" />
      </div>
    </section>

    <!-- Create / edit -->
    <UModal v-model:open="showEditor">
      <template #content>
        <ScheduleEditor :job="editing ?? undefined" :default-dir="workingDir" @save="onSave" @cancel="showEditor = false" />
      </template>
    </UModal>

    <!-- Delete -->
    <UModal :open="!!confirmDelete" @update:open="(v: boolean) => { if (!v) confirmDelete = null }">
      <template #content>
        <div v-if="confirmDelete" class="p-6 space-y-4 bg-overlay w-[420px] max-w-full">
          <h3 class="text-page-title">Delete schedule?</h3>
          <p class="text-[13px] text-label">"{{ confirmDelete.name }}" stops running and its run history is deleted. Chat sessions it created are kept.</p>
          <div class="flex justify-end gap-2">
            <UButton label="Cancel" variant="ghost" color="neutral" size="sm" @click="confirmDelete = null" />
            <UButton label="Delete" color="error" size="sm" @click="doDelete" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
.bg-overlay { background: var(--surface-raised); }
</style>
