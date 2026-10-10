<script setup lang="ts">
import { useContextReport } from '~/composables/useContextReport'

const props = defineProps<{ sessionId?: string | null; cwd?: string | null }>()

const { report, loading, error, fetchReport } = useContextReport({
  sessionId: () => props.sessionId,
  cwd: () => props.cwd,
})

const COLS = 20
const CELLS = COLS * 10

const COLORS: Record<string, string> = {
  'System prompt': '#9ca3af',
  'System tools': '#6b7280',
  'MCP tools': '#14b8a6',
  'MCP server instructions': '#16a34a',
  'Custom agents': '#b1b9f9',
  'Memory files': '#d77757',
  'Skills': '#ffc107',
  'Messages': '#827dbd',
}

const FREE = 'Free space'
const BUFFER = 'Autocompact buffer'

const isDeferred = (n: string) => /deferred/i.test(n)

const usedCategories = computed(() =>
  (report.value?.categories ?? []).filter(c => c.name !== FREE && c.name !== BUFFER && !isDeferred(c.name)),
)
const deferredCategories = computed(() => (report.value?.categories ?? []).filter(c => isDeferred(c.name)))
const freeCategory = computed(() => report.value?.categories.find(c => c.name === FREE))
const bufferCategory = computed(() => report.value?.categories.find(c => c.name === BUFFER))

const cells = computed(() => {
  const r = report.value
  if (!r || !r.windowTokens) return []
  const perCell = r.windowTokens / CELLS
  const out: { color?: string; kind: 'used' | 'free' | 'buffer'; title: string }[] = []
  for (const c of usedCategories.value) {
    const n = c.tokens > 0 ? Math.max(1, Math.round(c.tokens / perCell)) : 0
    for (let i = 0; i < n; i++) out.push({ kind: 'used', color: COLORS[c.name] ?? '#a3a3a3', title: `${c.name}: ${fmt(c.tokens)}` })
  }
  const bufferN = bufferCategory.value ? Math.round(bufferCategory.value.tokens / perCell) : 0
  while (out.length < CELLS - bufferN) out.push({ kind: 'free', title: FREE })
  while (out.length < CELLS) out.push({ kind: 'buffer', title: BUFFER })
  return out.slice(0, CELLS)
})

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

const ago = computed(() => {
  if (!report.value) return ''
  const s = Math.round((Date.now() - report.value.generatedAt) / 1000)
  return s < 60 ? 'just now' : `${Math.round(s / 60)}m ago`
})
</script>

<template>
  <div class="rounded-xl border bg-card" style="border-color: var(--border-subtle);">
    <div class="flex items-center justify-between gap-2 px-5 py-4 border-b" style="border-color: var(--border-subtle);">
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-layers" class="size-4" style="color: var(--text-tertiary);" />
        <span class="text-[11px] font-semibold uppercase tracking-wider" style="color: var(--text-tertiary);">Context Usage</span>
        <span v-if="report" class="text-[11px]" style="color: var(--text-tertiary);">· {{ report.sessionId ? 'this session' : 'fresh session' }}, {{ ago }}</span>
      </div>
      <button
        class="px-2.5 py-1 rounded-lg text-[12px] border flex items-center gap-1.5 hover-bg transition-colors"
        style="border-color: var(--border-subtle); color: var(--text-secondary);"
        :disabled="loading"
        @click="fetchReport(true)"
      >
        <UIcon name="i-lucide-refresh-cw" class="size-3" :class="loading ? 'animate-spin' : ''" />
        Refresh
      </button>
    </div>

    <div v-if="loading && !report" class="flex items-center justify-center py-10 gap-2 text-[13px]" style="color: var(--text-tertiary);">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin" />
      Running /context...
    </div>
    <div v-else-if="error && !report" class="p-5 text-[13px]" style="color: var(--error, #ef4444);">{{ error }}</div>

    <div v-else-if="report" class="p-5 space-y-6">
      <!-- Grid + legend -->
      <div class="flex flex-col gap-4">
        <div
          class="grid gap-[3px] w-full"
          :style="{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }"
        >
          <span
            v-for="(c, i) in cells"
            :key="i"
            class="aspect-square rounded-[3px] border"
            :title="c.title"
            :style="c.kind === 'used'
              ? { background: c.color, borderColor: c.color }
              : c.kind === 'buffer'
                ? { background: 'repeating-linear-gradient(45deg, var(--text-tertiary) 0 1.5px, transparent 1.5px 4px)', borderColor: 'var(--text-tertiary)' }
                : { background: 'color-mix(in srgb, var(--text-tertiary) 14%, transparent)', borderColor: 'color-mix(in srgb, var(--text-tertiary) 40%, transparent)' }"
          />
        </div>

        <div class="text-[13px] space-y-3 min-w-0">
          <div>
            <div class="font-semibold" style="color: var(--text-primary);">{{ report.model }}</div>
            <div class="font-mono text-[12px]" style="color: var(--text-secondary);">
              {{ fmt(report.usedTokens) }} / {{ fmt(report.windowTokens) }} tokens ({{ report.usedPct }}%)
            </div>
          </div>

          <div class="space-y-1">
            <div class="text-[11px] italic" style="color: var(--text-tertiary);">Estimated usage by category</div>
            <div v-for="c in usedCategories" :key="c.name" class="flex items-center gap-2" style="color: var(--text-secondary);">
              <span class="size-2.5 rounded-[3px] shrink-0" :style="{ background: COLORS[c.name] ?? '#a3a3a3' }" />
              <span>{{ c.name }}:</span>
              <span class="font-mono text-[12px]" style="color: var(--text-primary);">{{ fmt(c.tokens) }}</span>
              <span class="text-[12px]" style="color: var(--text-tertiary);">({{ c.pct }}%)</span>
            </div>
            <div v-if="freeCategory" class="flex items-center gap-2" style="color: var(--text-secondary);">
              <span class="size-2.5 rounded-[3px] shrink-0 border" style="background: color-mix(in srgb, var(--text-tertiary) 14%, transparent); border-color: color-mix(in srgb, var(--text-tertiary) 40%, transparent);" />
              <span>Free space:</span>
              <span class="font-mono text-[12px]" style="color: var(--text-primary);">{{ fmt(freeCategory.tokens) }}</span>
              <span class="text-[12px]" style="color: var(--text-tertiary);">({{ freeCategory.pct }}%)</span>
            </div>
            <div v-if="bufferCategory" class="flex items-center gap-2" style="color: var(--text-secondary);">
              <span class="size-2.5 rounded-[3px] shrink-0 border" :style="{ background: 'repeating-linear-gradient(45deg, var(--text-tertiary) 0 1.5px, transparent 1.5px 4px)', borderColor: 'var(--text-tertiary)' }" />
              <span>Autocompact buffer:</span>
              <span class="font-mono text-[12px]" style="color: var(--text-primary);">{{ fmt(bufferCategory.tokens) }}</span>
              <span class="text-[12px]" style="color: var(--text-tertiary);">({{ bufferCategory.pct }}%)</span>
            </div>
          </div>

          <div v-if="deferredCategories.length" class="space-y-1 pt-1 border-t" style="border-color: var(--border-subtle);">
            <div class="text-[11px] italic" style="color: var(--text-tertiary);">Deferred, not in window until loaded</div>
            <div v-for="c in deferredCategories" :key="c.name" class="text-[12px]" style="color: var(--text-secondary);">
              {{ c.name }}: <span class="font-mono">{{ fmt(c.tokens) }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
