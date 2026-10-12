<script setup lang="ts">
import { useUsageLimits } from '~/composables/useUsageLimits'

const { data, loading, error, refreshing, fetchLimits } = useUsageLimits()

function barColor(pct: number): string {
  if (pct < 50) return '#22c55e'
  if (pct < 75) return '#eab308'
  if (pct < 90) return '#f97316'
  return '#ef4444'
}

const props = defineProps<{ range?: string; projectId?: string | null }>()

const activePeriod = ref(0)

// Follow the page time range when /usage reports that window (24h, 7d); other ranges leave the toggle as is.
watch(
  () => [props.range, data.value?.periods.length],
  () => {
    const i = data.value?.periods.findIndex(p => p.label.replace('Last ', '') === props.range) ?? -1
    if (i >= 0) activePeriod.value = i
  },
  { immediate: true },
)
const period = computed(() => data.value?.periods[activePeriod.value])

interface TopSession {
  sessionId: string
  title: string
  project: string
  projectName: string
  requests: number
  tokens: number
  cost: number
  sharePct: number
  lastActive: number
}
const topSessions = ref<TopSession[]>([])
const topLoading = ref(false)

// Top sessions follow the page range; the endpoint caps at 30 days, so longer ranges show Last 30d.
const RANGE_HOURS: Record<string, number> = { '24h': 24, '7d': 7 * 24, '30d': 30 * 24 }
const MAX_HOURS = 30 * 24
const topHours = computed(() => RANGE_HOURS[props.range ?? '7d'] ?? MAX_HOURS)
const topLabel = computed(() => {
  const h = topHours.value
  return h === 24 ? 'Last 24h' : h === 7 * 24 ? 'Last 7d' : 'Last 30d'
})

async function fetchTopSessions(refresh = false) {
  topLoading.value = true
  try {
    const res = await $fetch<{ sessions: TopSession[] }>('/api/usage/top-sessions', { query: { hours: topHours.value, ...(props.projectId ? { projectId: props.projectId } : {}), ...(refresh ? { refresh: '1' } : {}) } })
    topSessions.value = res.sessions
  } catch {
    topSessions.value = []
  } finally {
    topLoading.value = false
  }
}

/** Same 10 min rule as the chat sidebar's live indicator */
function isLive(lastActive: number): boolean {
  return Date.now() - lastActive < 10 * 60 * 1000
}

function fmtCost(n: number): string { return `$${n.toFixed(2)}` }
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}
function fmtShare(n: number): string { return n < 1 ? '<1%' : `${Math.round(n)}%` }

onMounted(() => fetchTopSessions())
watch([topHours, () => props.projectId], () => fetchTopSessions())

async function refreshAll() {
  await Promise.all([fetchLimits(true), fetchTopSessions(true)])
}

function fmtAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  return `${Math.floor(m / 60)}h ago`
}
</script>

<template>
  <div class="rounded-xl border bg-card" style="border-color: var(--border-subtle);">
    <div class="flex items-center justify-between gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-gauge" class="size-4" style="color: var(--text-tertiary);" />
        <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Plan Limits</span>
        <span v-if="data?.plan" class="text-[11px]" style="color: var(--text-tertiary);">· from <code>claude /usage</code></span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="data?.generatedAt" class="text-[11px]" style="color: var(--text-tertiary);" title="Contributors and sessions are cached for 6h. Plan bars update in the background when older than 5 min. Click Refresh to recalculate everything.">{{ refreshing ? 'Updating...' : `Updated ${fmtAgo(data.generatedAt)}` }}</span>
        <button
          class="px-2.5 py-1 rounded-lg text-[12px] border flex items-center gap-1.5 hover-bg transition-colors"
          style="border-color: var(--border-subtle); color: var(--text-secondary);"
          :disabled="loading || refreshing || topLoading"
          @click="refreshAll"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3" :class="loading || refreshing ? 'animate-spin' : ''" />
          Refresh
        </button>
      </div>
    </div>

    <div v-if="loading && !data" class="flex items-center justify-center py-10 gap-2 text-[13px]" style="color: var(--text-tertiary);">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" />
      Running /usage...
    </div>
    <div v-else-if="error && !data" class="p-5 text-[13px]" style="color: var(--error, #ef4444);">{{ error }}</div>

    <div v-else-if="data" class="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Limit bars -->
      <div class="space-y-5">
        <div v-if="data.plan" class="text-[12px]" style="color: var(--text-tertiary);">{{ data.plan }}</div>
        <div v-for="l in data.limits" :key="l.label" class="space-y-1.5">
          <div class="flex items-baseline justify-between text-[13px]">
            <span style="color: var(--text-primary);">{{ l.label }}</span>
            <span class="font-mono text-[12px]" :style="{ color: barColor(l.pct) }">{{ l.pct }}% used</span>
          </div>
          <div class="h-2 rounded-full overflow-hidden" style="background: var(--surface-raised);">
            <div class="h-full rounded-full transition-all duration-500" :style="{ width: Math.min(100, l.pct) + '%', background: barColor(l.pct) }" />
          </div>
          <div class="text-[11px]" style="color: var(--text-tertiary);">{{ /^window/.test(l.resets) ? 'No active window - ' : 'Resets ' }}{{ l.resets }}</div>
        </div>
        <div v-if="data.limits.length === 0" class="text-[13px]" style="color: var(--text-tertiary);">
          No plan limits reported (API key billing?).
        </div>

      <!-- Contributors -->
      <div
        v-if="data.periods.length"
        class="space-y-3"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">What's contributing</span>
          <div class="flex gap-1">
            <button
              v-for="(p, i) in data.periods"
              :key="p.label"
              class="px-2 py-0.5 rounded-md text-[11px] border transition-colors"
              :style="activePeriod === i
                ? 'background: var(--accent-light); border-color: var(--accent); color: var(--accent);'
                : 'border-color: var(--border-subtle); color: var(--text-secondary);'"
              @click="activePeriod = i"
            >{{ p.label.replace('Last ', '') }}</button>
          </div>
        </div>

        <template v-if="period">
          <div class="text-[12px]" style="color: var(--text-tertiary);">
            {{ period.requests.toLocaleString() }} requests · {{ period.sessions }} sessions
          </div>
          <div v-for="i in period.insights" :key="i.text" class="flex items-baseline gap-2 text-[13px]">
            <span class="font-mono w-10 shrink-0" style="color: var(--accent);">{{ i.pct }}</span>
            <span style="color: var(--text-secondary);">{{ i.text }}</span>
          </div>
          <div v-for="t in period.tops" :key="t.kind" class="space-y-1 pt-1">
            <div class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Top {{ t.kind }}</div>
            <div v-for="it in t.items" :key="it.name" class="flex items-center justify-between text-[13px]">
              <span class="truncate" style="color: var(--text-primary);">{{ it.name }}</span>
              <span class="font-mono text-[12px]" style="color: var(--accent);">{{ it.pct }}</span>
            </div>
          </div>
          <div v-if="!period.tops.length" class="text-[12px]" style="color: var(--text-tertiary);">
            No skill, subagent or MCP attribution yet for this period.
          </div>
        </template>
        <p v-if="data.note" class="text-[11px] pt-2 truncate" style="color: var(--text-tertiary);">Approximate. Local sessions on this machine only, not other devices or claude.ai.</p>
      </div>
      </div>

      <!-- Top sessions -->
      <div class="lg:border-l lg:pl-6" style="border-color: var(--border-subtle);">
        <div class="text-[11px] font-semibold uppercase tracking-wider pb-2" style="color: var(--text-tertiary);">
          Top sessions · {{ topLabel }}
        </div>
        <div v-if="topLoading && !topSessions.length" class="text-[12px]" style="color: var(--text-tertiary);">Scanning sessions...</div>
        <div v-else-if="!topSessions.length" class="text-[12px]" style="color: var(--text-tertiary);">No sessions in this period.</div>
        <NuxtLink
          v-for="s in topSessions"
          :key="s.sessionId"
          :to="`/cli/project/${encodeURIComponent(s.projectName)}/session/${encodeURIComponent(s.sessionId)}`"
          class="flex items-center gap-3 py-2 px-2 -mx-2 text-[13px] border-b last:border-b-0 hover-bg transition-colors"
          style="border-color: var(--border-subtle);"
          :title="`${s.title}\n${s.project} · ${s.requests} req · ${fmtTokens(s.tokens)} tokens`"
        >
          <span
            class="size-1.5 shrink-0"
            :class="isLive(s.lastActive) ? 'rounded-full animate-pulse' : 'rounded-[2px]'"
            :style="isLive(s.lastActive)
              ? 'background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5);'
              : 'background: var(--text-disabled, #9ca3af); opacity: 0.4;'"
            :title="isLive(s.lastActive) ? 'Session is active' : ''"
          />
          <span class="truncate min-w-0 flex-1 font-semibold" style="color: var(--text-primary);">{{ s.title }}</span>
          <span class="font-mono text-[11px] shrink-0 w-14 text-right" style="color: var(--text-tertiary);">{{ fmtTokens(s.tokens) }}</span>
          <span class="font-mono text-[11px] shrink-0 w-24 text-right" style="color: var(--text-tertiary);">
            {{ fmtCost(s.cost) }} · {{ fmtShare(s.sharePct) }}
          </span>
        </NuxtLink>
        <p v-if="topSessions.length" class="text-[11px] pt-2" style="color: var(--text-tertiary);">Share = of estimated API-equivalent cost in this window, not plan-limit %.</p>
      </div>
    </div>
  </div>
</template>
