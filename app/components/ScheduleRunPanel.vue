<script setup lang="ts">
import { renderMarkdown } from '~/utils/markdown'
import type { RunStatus, ScheduleItem, ScheduleRunItem } from '~/composables/useSchedules'

const props = defineProps<{ job: ScheduleItem; runId: string }>()
const emit = defineEmits<{ back: []; changed: [] }>()

const { fetchRun } = useSchedules()
const run = ref<ScheduleRunItem | null>(null)
const missing = ref(false)

async function refresh() {
  const r = await fetchRun(props.job.id, props.runId)
  if (r) {
    const wasRunning = run.value?.status === 'running'
    run.value = r
    missing.value = false
    // Let the list update its status when a run finishes
    if (wasRunning && r.status !== 'running') emit('changed')
  } else if (!run.value) {
    missing.value = true
  }
}

watch(() => props.runId, () => {
  run.value = null
  missing.value = false
  refresh()
}, { immediate: true })

// Poll while the run is still going so the output appears without a reload
let timer: ReturnType<typeof setInterval> | null = null
watch(() => run.value?.status === 'running', (running) => {
  if (running && !timer) timer = setInterval(refresh, 3000)
  if (!running && timer) { clearInterval(timer); timer = null }
}, { immediate: true })
onUnmounted(() => { if (timer) clearInterval(timer) })

const STATUS: Record<RunStatus, { label: string; color: string; icon: string }> = {
  running: { label: 'Running', color: '#3b82f6', icon: 'i-lucide-loader-2' },
  success: { label: 'Success', color: '#22c55e', icon: 'i-lucide-check-circle-2' },
  error: { label: 'Failed', color: '#ef4444', icon: 'i-lucide-x-circle' },
  timeout: { label: 'Timed out', color: '#d97706', icon: 'i-lucide-timer-off' },
}

const when = (iso?: string) =>
  iso ? new Date(iso).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''
function duration(ms?: number) {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
const sessionLink = computed(() =>
  run.value?.sessionId
    ? `/cli/project/${encodeURIComponent(projectSlug(props.job.workingDir.replace(/\/+$/, '')))}/session/${encodeURIComponent(run.value.sessionId)}`
    : null,
)
// Open result links (Jira tickets etc.) in a new tab
const resultHtml = computed(() =>
  run.value?.result
    ? renderMarkdown(run.value.result).replace(/<a href=/g, '<a target="_blank" rel="noopener noreferrer" href=')
    : '',
)
</script>

<template>
  <div class="h-full flex flex-col min-h-0">
    <div v-if="missing" class="flex-1 flex flex-col items-center justify-center text-center p-8 gap-2">
      <UIcon name="i-lucide-file-x" class="size-8 text-meta" />
      <p class="text-[14px] font-medium">Run not found</p>
      <p class="text-[12px] text-meta">It may have been pruned.</p>
      <button class="text-[12px] hover:underline" style="color: var(--accent)" @click="emit('back')">Back to {{ job.name }}</button>
    </div>

    <div v-else-if="!run" class="flex-1 flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-meta" />
    </div>

    <template v-else>
      <!-- Header -->
      <div class="shrink-0 px-6 min-h-[56px] py-2 flex items-center gap-3" style="border-bottom: 1px solid var(--border-subtle)">
        <button class="p-1.5 rounded-lg hover-bg focus-ring flex items-center justify-center" style="color: var(--text-secondary)" title="Back to schedule" @click="emit('back')">
          <UIcon name="i-lucide-arrow-left" class="size-4 block" />
        </button>
        <div class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span class="flex items-center gap-1.5 text-[14px] font-semibold" :style="{ color: STATUS[run.status].color }">
              <UIcon :name="STATUS[run.status].icon" class="size-4" :class="{ 'animate-spin': run.status === 'running' }" />
              {{ STATUS[run.status].label }}
            </span>
            <span class="text-[12px] text-label truncate">{{ job.name }}</span>
          </div>
          <p class="text-[11px] font-mono text-meta truncate">
            {{ when(run.startedAt) }} &middot; {{ run.trigger === 'manual' ? 'manual run' : 'scheduled run' }}
            <template v-if="run.durationMs != null"> &middot; {{ duration(run.durationMs) }}</template>
            <template v-if="run.costUsd != null"> &middot; ${{ run.costUsd.toFixed(2) }}</template>
            <template v-if="run.numTurns != null"> &middot; {{ run.numTurns }} turns</template>
          </p>
        </div>
        <NuxtLink v-if="sessionLink" :to="sessionLink">
          <UButton size="sm" variant="soft" icon="i-lucide-message-square" label="Open chat session" />
        </NuxtLink>
      </div>

      <!-- Output -->
      <div class="flex-1 min-h-0 overflow-y-auto custom-scrollbar px-6 py-5 space-y-4">
        <div v-if="run.error" class="rounded-xl px-4 py-3 text-[13px]" style="background: rgba(239,68,68,0.08); color: #ef4444;">{{ run.error }}</div>
        <div v-if="run.permissionDenials?.length" class="rounded-xl px-4 py-3 text-[13px]" style="background: rgba(217,119,6,0.08); color: #d97706;">
          Blocked: {{ [...new Set(run.permissionDenials)].join(', ') }}. Add it to the schedule's allowed tools if the run needs it.
        </div>

        <div v-if="resultHtml" class="rounded-xl bg-card p-6" style="border: 1px solid var(--border-subtle)">
          <div class="run-result text-[14px] leading-[1.7] max-w-4xl" v-html="resultHtml" />
        </div>
        <p v-else-if="run.status === 'running'" class="flex items-center gap-2 text-[13px] text-meta">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" /> Running. This updates when the run finishes.
        </p>
        <p v-else class="text-[13px] text-meta">This run produced no output.</p>

        <details v-if="run.command" class="rounded-xl bg-card px-4 py-3" style="border: 1px solid var(--border-subtle)">
          <summary class="text-[12px] text-meta cursor-pointer">Command</summary>
          <pre class="text-[11px] font-mono whitespace-pre-wrap break-all mt-2 text-label">{{ run.command }}</pre>
        </details>
        <details v-if="run.stderr" class="rounded-xl bg-card px-4 py-3" style="border: 1px solid var(--border-subtle)">
          <summary class="text-[12px] text-meta cursor-pointer">Errors from Claude</summary>
          <pre class="text-[11px] font-mono whitespace-pre-wrap break-all mt-2 text-label">{{ run.stderr }}</pre>
        </details>
      </div>
    </template>
  </div>
</template>

<style scoped>
.run-result :deep(table) { border-collapse: collapse; width: 100%; font-size: 13px; margin: 0.8em 0; }
.run-result :deep(th), .run-result :deep(td) { border: 1px solid var(--border-subtle); padding: 6px 10px; text-align: left; vertical-align: top; }
.run-result :deep(th) { background: var(--surface-raised); font-weight: 600; }
.run-result :deep(a) { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; white-space: nowrap; cursor: pointer; }
.run-result :deep(a:hover) { opacity: 0.8; }
.run-result :deep(p) { margin: 0.6em 0; }
.run-result :deep(ul), .run-result :deep(ol) { padding-left: 1.5em; margin: 0.6em 0; }
.run-result :deep(h1), .run-result :deep(h2), .run-result :deep(h3) { font-weight: 600; margin: 1em 0 0.4em; }
.run-result :deep(code) { font-family: var(--font-mono); font-size: 0.9em; background: var(--badge-subtle-bg); padding: 0.1em 0.35em; border-radius: 4px; }
.run-result :deep(pre) { overflow-x: auto; padding: 10px 12px; border-radius: 8px; background: var(--surface-base); }
</style>
