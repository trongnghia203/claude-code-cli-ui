<script setup lang="ts">
import { useUsageStats, type TimeRange } from '~/composables/useUsageStats'

const {
  stats, loading, error,
  timeRange, selectedProjectId,
  formatCost, formatTokens, shortModelName, fetchStats,
} = useUsageStats()

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '24h', label: 'Last 24h' },
  { value: '7d',  label: 'Last 7d' },
  { value: '30d', label: 'Last 30d' },
  { value: '3m',  label: 'Last 3M' },
  { value: '6m',  label: 'Last 6M' },
  { value: '1y',  label: 'Last Year' },
]

// All unique model names sorted by cost desc for stacked bar chart
const modelNames = computed(() => {
  if (!stats.value) return []
  return [...stats.value.byModel].sort((a, b) => b.cost - a.cost).map(m => m.name)
})

const sortedByModel = computed(() => {
  if (!stats.value) return []
  return [...stats.value.byModel].sort((a, b) => b.cost - a.cost)
})

const sortedByProject = computed(() => {
  if (!stats.value) return []
  return [...stats.value.byProject].sort((a, b) => b.cost - a.cost)
})

// Unique projects for project filter
const projectOptions = computed(() => {
  return sortedByProject.value.map(p => ({ id: p.id, name: p.name }))
})

function exportCsv() {
  if (!stats.value) return
  const rows = [
    ['Model', 'Input Tokens', 'Output Tokens', 'Cache Creation', 'Cache Read', 'Cost ($)'],
    ...sortedByModel.value.map(m => [
      m.name, m.inputTokens, m.outputTokens, m.cacheCreationTokens, m.cacheReadTokens,
      m.cost.toFixed(6),
    ]),
  ]
  const csv = rows.map(r => r.join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `token-usage-${timeRange.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="px-6 py-5 space-y-5">
    <!-- Header -->
    <div class="flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1 class="text-xl font-bold" style="color: var(--text-primary);">Token Usage</h1>
        <p class="text-[13px] mt-0.5" style="color: var(--text-tertiary);">Spending and token consumption across projects</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <!-- Time range -->
        <select
          v-model="timeRange"
          class="px-3 py-1.5 rounded-lg text-[13px] border outline-none cursor-pointer"
          style="background: var(--surface-raised); border-color: var(--border-subtle); color: var(--text-primary);"
        >
          <option v-for="r in TIME_RANGES" :key="r.value" :value="r.value">{{ r.label }}</option>
        </select>
        <!-- Project filter -->
        <select
          class="px-3 py-1.5 rounded-lg text-[13px] border outline-none cursor-pointer"
          style="background: var(--surface-raised); border-color: var(--border-subtle); color: var(--text-primary);"
          :value="selectedProjectId || ''"
          @change="selectedProjectId = ($event.target as HTMLSelectElement).value || null"
        >
          <option value="">All Projects</option>
          <option v-for="p in projectOptions" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <!-- Export -->
        <button
          class="px-3 py-1.5 rounded-lg text-[13px] border flex items-center gap-1.5 hover-bg transition-colors"
          style="border-color: var(--border-subtle); color: var(--text-secondary);"
          @click="exportCsv"
        >
          <UIcon name="i-lucide-download" class="size-3.5" />
          CSV
        </button>
      </div>
    </div>

    <!-- Loading / error -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-6 animate-spin" style="color: var(--text-tertiary);" />
    </div>
    <div v-else-if="error" class="rounded-xl p-5 text-sm" style="background: var(--error-muted, #3a1212); color: var(--error, #ef4444);">
      {{ error }}
    </div>

    <template v-else-if="stats">
      <!-- Stat cards -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <UsageStatCard
          title="Total Cost"
          :value="formatCost(stats.totalCost)"
          subtitle="Estimated total spend"
          icon="i-lucide-credit-card"
        />
        <UsageStatCard
          title="Input Volume"
          :value="formatTokens(stats.totalInputTokens + stats.totalCacheCreationTokens + stats.totalCacheReadTokens)"
          subtitle="Context and prompts"
          icon="i-lucide-arrow-up-right"
        />
        <UsageStatCard
          title="Output Volume"
          :value="formatTokens(stats.totalOutputTokens)"
          subtitle="AI responses"
          icon="i-lucide-arrow-down-left"
        />
      </div>

      <!-- Timeline + Cost Breakdown -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Timeline (2/3) -->
        <div class="lg:col-span-2 rounded-xl p-5 border bg-card" style="border-color: var(--border-subtle); min-height: 320px;">
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-lucide-area-chart" class="size-4" style="color: var(--text-tertiary);" />
            <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Usage Timeline</span>
          </div>
          <div style="height: 250px;">
            <UsageTimelineChart :data="stats.byDay" :model-names="modelNames" />
          </div>
        </div>

        <!-- Cost breakdown (1/3) -->
        <div class="rounded-xl p-5 border bg-card" style="border-color: var(--border-subtle); min-height: 320px;">
          <div class="flex items-center gap-2 mb-4">
            <UIcon name="i-lucide-pie-chart" class="size-4" style="color: var(--text-tertiary);" />
            <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Cost Breakdown</span>
          </div>
          <div style="height: 250px;">
            <UsageCostBreakdownChart :models="sortedByModel" />
          </div>
        </div>
      </div>

      <!-- Projects + Model Performance -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Top projects (1/3) -->
        <div class="rounded-xl border bg-card" style="border-color: var(--border-subtle);">
          <div class="flex items-center gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
            <UIcon name="i-lucide-folder" class="size-4" style="color: var(--text-tertiary);" />
            <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Top Projects</span>
          </div>
          <div class="divide-y" style="divide-color: var(--border-subtle);">
            <div
              v-for="p in sortedByProject.slice(0, 12)"
              :key="p.id"
              class="flex items-center justify-between px-5 py-2.5 cursor-pointer hover-bg text-[13px]"
              :class="selectedProjectId === p.id ? 'font-medium' : ''"
              :style="selectedProjectId === p.id ? 'background: var(--accent-light);' : ''"
              @click="selectedProjectId = selectedProjectId === p.id ? null : p.id"
            >
              <span class="truncate mr-2" style="color: var(--text-primary);">{{ p.name }}</span>
              <span class="shrink-0 font-mono text-[12px]" style="color: var(--accent);">{{ formatCost(p.cost) }}</span>
            </div>
            <div v-if="sortedByProject.length === 0" class="px-5 py-4 text-[13px]" style="color: var(--text-tertiary);">
              No project data
            </div>
          </div>
        </div>

        <!-- Model performance (2/3) -->
        <div class="lg:col-span-2 rounded-xl border bg-card" style="border-color: var(--border-subtle);">
          <div class="flex items-center gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
            <UIcon name="i-lucide-bar-chart-2" class="size-4" style="color: var(--text-tertiary);" />
            <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Model Performance</span>
          </div>
          <table class="w-full text-[13px]">
            <thead>
              <tr class="border-b" style="border-color: var(--border-subtle);">
                <th class="px-5 py-2.5 text-left font-medium" style="color: var(--text-tertiary);">Model</th>
                <th class="px-5 py-2.5 text-right font-medium tabular-nums" style="color: var(--text-tertiary);">Input</th>
                <th class="px-5 py-2.5 text-right font-medium tabular-nums" style="color: var(--text-tertiary);">Output</th>
                <th class="px-5 py-2.5 text-right font-medium tabular-nums" style="color: var(--text-tertiary);">Cost</th>
              </tr>
            </thead>
            <tbody class="divide-y" style="divide-color: var(--border-subtle);">
              <tr v-for="m in sortedByModel" :key="m.name" class="hover-bg">
                <td class="px-5 py-2.5" style="color: var(--text-primary);">{{ shortModelName(m.name) }}</td>
                <td class="px-5 py-2.5 text-right font-mono tabular-nums" style="color: var(--text-secondary);">{{ formatTokens(m.inputTokens) }}</td>
                <td class="px-5 py-2.5 text-right font-mono tabular-nums" style="color: var(--text-secondary);">{{ formatTokens(m.outputTokens) }}</td>
                <td class="px-5 py-2.5 text-right font-mono tabular-nums font-medium" style="color: var(--accent);">{{ formatCost(m.cost) }}</td>
              </tr>
              <tr v-if="sortedByModel.length === 0">
                <td colspan="4" class="px-5 py-4 text-center" style="color: var(--text-tertiary);">No data for this period</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <div v-else class="text-center py-20 text-[13px]" style="color: var(--text-tertiary);">
      No usage data found
    </div>
  </div>
</template>
