<script setup lang="ts">
import { useUsageLimits } from '~/composables/useUsageLimits'

const { data, loading, error, fetchLimits } = useUsageLimits()

function barColor(pct: number): string {
  if (pct < 50) return '#22c55e'
  if (pct < 75) return '#eab308'
  if (pct < 90) return '#f97316'
  return '#ef4444'
}

const activePeriod = ref(0)
const period = computed(() => data.value?.periods[activePeriod.value])
</script>

<template>
  <div class="rounded-xl border bg-card" style="border-color: var(--border-subtle);">
    <div class="flex items-center justify-between gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-gauge" class="size-4" style="color: var(--text-tertiary);" />
        <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Plan Limits</span>
        <span v-if="data?.plan" class="text-[11px]" style="color: var(--text-tertiary);">· from <code>claude /usage</code></span>
      </div>
      <button
        class="px-2.5 py-1 rounded-lg text-[12px] border flex items-center gap-1.5 hover-bg transition-colors"
        style="border-color: var(--border-subtle); color: var(--text-secondary);"
        :disabled="loading"
        @click="fetchLimits(true)"
      >
        <UIcon name="i-lucide-refresh-cw" class="size-3" :class="loading ? 'animate-spin' : ''" />
        Refresh
      </button>
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
          <div class="text-[11px]" style="color: var(--text-tertiary);">Resets {{ l.resets }}</div>
        </div>
        <div v-if="data.limits.length === 0" class="text-[13px]" style="color: var(--text-tertiary);">
          No plan limits reported (API key billing?).
        </div>
      </div>

      <!-- Contributors -->
      <div v-if="data.periods.length" class="space-y-3">
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
            <span class="font-mono w-10 shrink-0 text-right" style="color: var(--accent);">{{ i.pct }}</span>
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
        <p v-if="data.note" class="text-[11px] pt-2" style="color: var(--text-tertiary);">{{ data.note }}</p>
      </div>
    </div>
  </div>
</template>
